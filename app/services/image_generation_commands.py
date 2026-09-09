"""Shared image admission using native preparation, tasks and generation FIFO.

The receipt proves admission. TaskRegistry remains the progress authority and
the native generation queue remains the sole execution/recovery mechanism.
"""
from __future__ import annotations

from copy import deepcopy
import re
import sqlite3
import time
import uuid

from fastapi import HTTPException
from services.image_generation_spec import freeze_image_generation_spec, ImageGenerationSpecError
from services.task_command_admission import TaskCommandConflict
from services.wangp_submission import JsonRequest


def command_error(status: int, code: str, message: str):
    return HTTPException(status, {"code": code, "message": message, "retryable": status >= 500})


def validate_image_model(params, *, model_definition, model_downloaded):
    definition = model_definition(params["model_type"])
    if not definition or not definition.get("image_outputs") or definition.get("returns_audio"):
        raise command_error(422, "unsupported_model", "Choose an exact text-to-image model from the model catalog")
    if definition.get("at_least_one_image_ref_needed"):
        raise command_error(422, "reference_required", "This model requires references; choose a text-to-image model")
    if not model_downloaded(params["model_type"]):
        raise command_error(409, "model_unavailable", "Required model files are not installed; install them before submitting")
    match = re.fullmatch(r"([1-9][0-9]{1,4})x([1-9][0-9]{1,4})", params["resolution"])
    if not match or any(not 64 <= int(value) <= 4096 or int(value) % 8 for value in match.groups()):
        raise command_error(422, "invalid_resolution", "Resolution must be WIDTHxHEIGHT, each 64..4096 and a multiple of 8")


class ImageGenerationCommands:
    def __init__(self, *, registry, prepare, preflight, make_job, task_fields,
                 dispatch, persist_recovery, active_job_ids):
        self.registry = registry
        self.prepare = prepare
        self.preflight = preflight
        self.make_job = make_job
        self.task_fields = task_fields
        self.dispatch = dispatch
        self.persist_recovery = persist_recovery
        self.active_job_ids = active_job_ids
        self.owner = uuid.uuid4().hex

    def _registry(self, workspace):
        # Exact physical output location; no active-browser fallback and no
        # collection-ID substitution. The native resolver enforces containment.
        if not isinstance(workspace, str) or not re.fullmatch(r"(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)", workspace):
            raise command_error(422, "invalid_workspace", "Use an explicit valid output workspace")
        return self.registry(workspace)

    @staticmethod
    def _validate_replay(entry, frozen):
        if entry["operation"] != "generation.image" or entry["digest"] != frozen["fingerprint"]:
            raise TaskCommandConflict("intent_id was already used with different parameters or preconditions")

    def _dispatch_admitted(self, registry, entry):
        try:
            self._dispatch_pending(registry, entry)
        except HTTPException as error:
            if error.status_code >= 500:
                raise
            raise command_error(503, "admission_recovery_needed", "Admission is durable; consult its receipt and task before recovery") from error

    def _dispatch_pending(self, registry, entry):
        task = registry.get(entry["task_id"])
        if not task or task["status"] != "queued" or entry["dispatch_owner"] is not None:
            return
        runtime = entry["effective"]["runtime"]
        job = self.make_job(deepcopy(runtime["params"]), runtime["workspace"],
                            job_id=task["backend_job_id"], created_at=task["created_at"],
                            reserve_generation=False, publish_task=False,
                            provenance=deepcopy(runtime["provenance"]))
        # A failure here keeps admission pending and safely retryable. Unlike
        # legacy best-effort persistence, this path must not dispatch on failure.
        self.persist_recovery(job)
        if registry.claim_command_dispatch(entry["intent_id"], self.owner):
            try:
                self.dispatch(job)
            except Exception:
                # Dispatch may have started before raising. Never release the
                # claim or infer that a transport retry should start it again.
                raise command_error(503, "dispatch_uncertain", "Admission is durable; inspect its task before explicitly recovering") from None

    def _admit(self, frozen, body, workspace, provenance):
        registry = self._registry(workspace)
        provenance = deepcopy(provenance)
        provenance["command"]["command_id"] = frozen["original"]["intent_id"]
        job = self.make_job(body, workspace, reserve_generation=False, publish_task=False, provenance=provenance)
        effective = deepcopy(frozen["effective"])
        effective["runtime"] = {"params": deepcopy(job["params"]), "workspace": workspace,
                                "provenance": deepcopy(job["provenance"])}
        admitted = registry.admit_command_task(
            intent_id=frozen["original"]["intent_id"], operation="generation.image",
            digest=frozen["fingerprint"], original=frozen["original"], effective=effective,
            task_fields=self.task_fields(job),
        )
        entry = registry.command_admission(frozen["original"]["intent_id"])
        self._dispatch_admitted(registry, entry)
        return admitted

    async def submit(self, command, *, trusted_tool=None):
        try:
            frozen = freeze_image_generation_spec(command)
            params = frozen["effective"]["input"]
            registry = self._registry(params["workspace"])
            previous = registry.command_admission(command["intent_id"])
            if previous is not None:
                self._validate_replay(previous, frozen)
                self._dispatch_admitted(registry, previous)
                return {"receipt": previous["receipt"], "replayed": True}
            self.preflight(params)
            request = JsonRequest({**deepcopy(params), "provenance": {
                "actor": "user", "capability": "generation.image",
                "command": {"command_id": command["intent_id"]},
            }}, trusted_tool=trusted_tool)
            # This callback is an in-process capability, never a JSON option.
            # The native facade performs its ordinary validation first and then
            # transfers admission to the same canonical task/worker adapter.
            request.admit_generation_command = lambda body, workspace, provenance: self._admit(frozen, body, workspace, provenance)
            return await self.prepare(request)
        except ImageGenerationSpecError as error:
            raise command_error(422, "invalid_command", str(error)) from error
        except TaskCommandConflict as error:
            raise command_error(409, "intent_conflict", str(error)) from error
        except (OSError, sqlite3.Error) as error:
            raise command_error(503, "storage_unavailable", "Command storage is unavailable; retry with the same intention") from error

    def receipt(self, workspace, intent_id):
        if not isinstance(intent_id, str) or not 1 <= len(intent_id) <= 160:
            raise command_error(422, "invalid_command", "An exact intent_id is required")
        try:
            registry = self._registry(workspace)
            entry = registry.command_admission(intent_id)
            if entry is None:
                raise command_error(404, "receipt_not_found", "No admission exists for this intention in this workspace")
            return {"receipt": entry["receipt"], "task": registry.get(entry["task_id"])}
        except (OSError, sqlite3.Error) as error:
            raise command_error(503, "storage_unavailable", "Command storage is unavailable") from error

    def restore_recovery(self, workspaces):
        """Rebuild only the existing recovery projection; never start inference."""
        active = set(self.active_job_ids())
        for workspace in workspaces:
            registry = self._registry(workspace)
            for entry in registry.command_recovery_candidates():
                task = registry.get(entry["task_id"])
                if task["backend_job_id"] in active:
                    continue
                runtime = entry["effective"]["runtime"]
                # No model preflight: recovering the editable request must also
                # work while the original model is unavailable.
                self.persist_recovery({"id": task["backend_job_id"], "status": "interrupted",
                                       "created_at": task["created_at"], **deepcopy(runtime)})

    def _recovery_task(self, record):
        provenance = record.get("provenance") or {}
        if provenance.get("capability") != "generation.image":
            return None
        registry = self._registry(record["workspace"])
        intent_id = provenance.get("command", {}).get("command_id")
        entry = registry.command_admission(intent_id)
        if entry is None or entry["receipt"]["result"]["job_id"] != record["id"]:
            raise command_error(503, "recovery_mismatch", "Recovery does not match a durable image admission")
        return registry, registry.get(entry["task_id"])

    def filter_recovery(self, records):
        retained = []
        for record in records:
            linked = self._recovery_task(record)
            if linked is None or (linked[1] and linked[1]["status"] == "interrupted"):
                retained.append(record)
        return retained

    def discard_recovery(self, records):
        for record in records:
            linked = self._recovery_task(record)
            if linked is not None and linked[1] and linked[1]["status"] == "interrupted":
                registry, task = linked
                registry.update(task["id"], status="cancelled", phase="recovery_discarded",
                                message="Recovery discarded", completed_at=time.time(), recoverable=False)
