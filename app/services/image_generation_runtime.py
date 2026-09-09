"""Bind shared image commands to the existing native runtime, without a queue."""
from copy import deepcopy
import threading

from services.image_generation_commands import ImageGenerationCommands, validate_image_model, command_error
from services.job_lifecycle import request_cancel


def create_image_generation_commands(runtime):
    def persist(job):
        runtime["_durable_generation_queue"].upsert({
            key: deepcopy(job[key]) for key in ("id", "status", "created_at", "params", "workspace", "provenance")
        })

    def dispatch(job):
        thread = threading.Thread(target=runtime["_run_generation_with_preparation"], args=(job["id"],),
                                  name=f"command-generation-{job['id']}", daemon=False)
        try:
            runtime["_jobs"][job["id"]] = job
            runtime["register_generation_job"](runtime["_gen_lock"], job)
            runtime["_cancel_h3_idle_release"]()
            thread.start()
        except Exception:
            if thread.ident is None:
                # This native Thread never started. Release its FIFO position
                # through the existing cancellation lifecycle and expose a
                # recoverable interruption, retaining the admission/snapshot.
                request_cancel(job, job_id=job["id"], active_states=runtime["_active_gen_states"])
                runtime["_jobs"].pop(job["id"], None)
                runtime["_task_registry"](job["workspace"]).update(
                    job["task_id"], status="interrupted", phase="dispatch_failed", force=True,
                    message="Worker could not start; use queue recovery", recoverable=True,
                )
            raise

    def preflight(params):
        try:
            runtime["execution_mode"].validate_generation(params["workspace"])
        except runtime["execution_mode"].ExecutionModeError as error:
            raise command_error(409, "execution_policy", str(error)) from error
        validate_image_model(params, model_definition=runtime["wgp"].get_model_def,
                             model_downloaded=runtime["_check_model_downloaded"])

    return ImageGenerationCommands(
        registry=runtime["_task_registry"], prepare=runtime["generate"], preflight=preflight,
        make_job=runtime["_new_generation_job"], task_fields=runtime["_generation_task_fields"],
        dispatch=dispatch, persist_recovery=persist, active_job_ids=lambda: runtime["_jobs"].keys(),
    )
