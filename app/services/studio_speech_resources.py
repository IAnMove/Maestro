"""Inspect canonical speech references without changing their source workspace."""
from copy import deepcopy
import math
import subprocess

from services.studio_image_resources import StudioImageResources, file_identity
from services.video_editor import probe_audio


SPEECH_AUDIO_FIELDS = ("audio_guide", *(f"audio_guide{i}" for i in range(2, 7)))


class StudioSpeechResources(StudioImageResources):
    media_kind = "audio"

    def prepare_media(self, params):
        working = deepcopy(params)
        resources = []
        for field in SPEECH_AUDIO_FIELDS:
            value = working.get(field)
            if not value:
                continue
            path, workspace = self._media(value)
            identity = file_identity(path)
            try:
                information = probe_audio(path)
            except subprocess.TimeoutExpired as error:
                raise ValueError("A selected voice reference could not be inspected in time") from error
            duration = information["duration"]
            if not math.isfinite(duration) or duration <= 0:
                raise ValueError("A selected voice reference has no finite positive duration")
            resources.append({"role": field, "index": 0, "url": value,
                              "workspace": workspace, "duration_seconds": duration, **identity})
            working[field] = path
        return working, resources
