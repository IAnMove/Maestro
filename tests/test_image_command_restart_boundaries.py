"""Restart-boundary checks using the production TaskRegistry factory.

These tests model the two points at which the native worker may be absent:
before the durable generation projection is written and after initial dispatch
has been claimed.  They deliberately do not start a model worker.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json

from services.task_manager import forget_task_registry, get_task_registry


def _digest(value: dict) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _admit(registry, intent_id: str) -> tuple[dict, str]:
    original = {
        "version": 1,
        "operation": "generation.image",
        "intent_id": intent_id,
        "input": {
            "workspace": "restart-boundary",
            "model_type": "installed-image-model",
            "prompt": "literal restart probe",
            "resolution": "512x512",
            "num_inference_steps": 1,
            "seed": -1,
            "guidance_scale": 1.0,
        },
    }
    effective = deepcopy(original)
    task_id = f"task-{intent_id}"
    registry.admit_command_task(
        intent_id=intent_id,
        operation="generation.image",
        digest=_digest(effective),
        original=original,
        effective=effective,
        task_fields={
            "id": task_id,
            "root_id": f"root-{task_id}",
            "kind": "image",
            "workflow": "generation.image",
            "title": "Restart boundary probe",
            "status": "queued",
            "phase": "queued",
            "message": "Queued",
            "workspace": "restart-boundary",
            "backend_job_id": f"job-{intent_id}",
            "current": 0,
            "total": 1,
            "recoverable": True,
            "metadata": {"test": "restart-boundary"},
        },
    )
    return original, task_id


def test_factory_restart_recovers_admission_when_projection_was_never_persisted(tmp_path):
    """A fresh production factory interrupts a committed queued admission."""
    first = get_task_registry(str(tmp_path))
    original, task_id = _admit(first, "before-persist")
    assert first.get(task_id)["status"] == "queued"

    # No durable generation-queue projection is written: this is the crash
    # between canonical admission and persist_recovery().
    forget_task_registry(str(tmp_path))
    restarted = get_task_registry(str(tmp_path))  # default interrupt_stale=True

    task = restarted.get(task_id)
    assert task["status"] == "interrupted"
    candidates = restarted.command_recovery_candidates()
    assert [entry["intent_id"] for entry in candidates] == [original["intent_id"]]


def test_factory_restart_recovers_admission_after_dispatch_claim(tmp_path):
    """A claimed queued admission is interrupted and remains recoverable."""
    first = get_task_registry(str(tmp_path))
    original, task_id = _admit(first, "after-claim")
    assert first.claim_command_dispatch(original["intent_id"], "dispatch-owner") is True
    assert first.get(task_id)["status"] == "queued"
    assert first.command_admission(original["intent_id"])["dispatch_owner"] == "dispatch-owner"

    # The real factory's bootstrap calls interrupt_unfinished() before the
    # recovery projection is queried.  No second dispatch is performed here.
    forget_task_registry(str(tmp_path))
    restarted = get_task_registry(str(tmp_path))  # default interrupt_stale=True

    assert restarted.get(task_id)["status"] == "interrupted"
    entry = restarted.command_admission(original["intent_id"])
    assert entry["dispatch_owner"] == "dispatch-owner"
    assert [candidate["intent_id"] for candidate in restarted.command_recovery_candidates()] == [original["intent_id"]]
