"""Recheck an admitted SFX request immediately before native model work.

TaskRegistry owns both the receipt and its prepared snapshot. This check is
read-only and never downloads weights or creates another execution record.
"""
from collections.abc import Mapping
import json

from services.studio_image_resources import file_identity


def prepared_sfx_execution(job, params, *, registry, check_models):
    """Return whether this is a verified command, or reject changed resources.

    Ordinary legacy jobs return False. Claiming the typed capability requires
    an existing matching admission; client provenance alone grants nothing.
    """
    provenance = job.get("provenance")
    if not isinstance(provenance, Mapping) or provenance.get("capability") != "generation.sfx":
        return False
    command = provenance.get("command")
    intent = command.get("command_id") if isinstance(command, Mapping) else None
    if not isinstance(intent, str) or not intent:
        raise ValueError("SFX execution requires its original command receipt")
    entry = registry.command_admission(intent)
    if not isinstance(entry, Mapping) or entry.get("operation") != "generation.sfx":
        raise ValueError("SFX execution has no matching command admission")
    task = registry.get(entry["task_id"])
    if (not task or task["id"] != job.get("task_id")
            or task.get("backend_job_id") != job.get("id")
            or task.get("workspace") != job.get("workspace")):
        raise ValueError("SFX execution does not match its admitted task")
    runtime = entry["effective"]["runtime"]
    expected = runtime["params"]
    if (runtime["workspace"] != job.get("workspace")
            or json.dumps(params, sort_keys=True, allow_nan=False)
            != json.dumps(expected, sort_keys=True, allow_nan=False)):
        raise ValueError("SFX execution parameters changed after admission")
    guides = [resource for resource in entry["effective"].get("resources", [])
              if resource.get("role") == "video_guide"]
    path = params.get("video_guide")
    if path:
        if len(guides) != 1:
            raise ValueError("The admitted SFX video has no unique resource identity")
        try:
            current = file_identity(path)
        except OSError as error:
            raise ValueError("The admitted SFX video is no longer available") from error
        if any(current[key] != guides[0].get(key) for key in ("sha256", "size_bytes")):
            raise ValueError("The admitted SFX video changed; select it in a new request")
    elif guides:
        raise ValueError("The admitted SFX video must not become a text-only request")
    check_models(params["_mmaudio_variant"])
    return True
