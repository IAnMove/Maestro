"""Small, dependable FFmpeg assembly backend for Maestro's video editor.

The editor deliberately stores only references to uploads/workspace outputs.
Path validation remains the responsibility of the API layer; every path passed
to this module must already be resolved to a permitted local file.

Frame / PTS contract
--------------------
Assembly is counted in integer frames at the integer output fps
``{24, 25, 30, 50, 60}``. Seconds are the rational ``frames / fps``; they are
never rounded to 4 decimals and then multiplied back by fps.

Each source frame ``i`` covers the half-open interval ``[i/fps, (i+1)/fps)``.
Trim endpoints snap to the nearest source frame. A full-span clip whose
source fps matches the output fps keeps every decoded source frame: a
193-frame 30fps file stays 193 frames, not 192. The historical 589-from-590
export came from ``round(duration, 4)`` (6.4333s for 193/30) feeding ``-t``,
which stopped short of the last frame before concat.

Crossfades subtract ``round(overlap_seconds * fps)`` frames. Interstitial
time cards add ``round(card_seconds * fps)`` frames. Audio is padded to the
video span and compared by decoded samples / stream duration, not by
container duration alone. Export writes a staging file and replaces the
destination only after that validation; failures and cancels leave any
previous output untouched.
"""

from __future__ import annotations

import json
import math
import os
import random
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from fractions import Fraction
from typing import Any


ProgressCallback = Callable[[int, str], None]
AbortCallback = Callable[[], bool]

INTERSTITIAL_TRANSITIONS = frozenset(
    {"later-clock", "later-tropical", "later-cinematic"}
)

SOURCE_SIDECAR_LIMIT_BYTES = 4 * 1024 * 1024
MIN_TRIM_SECONDS = 0.05
SUPPORTED_FPS = (24, 25, 30, 50, 60)
_AUDIO_PAD_TOLERANCE_SECONDS = 0.25


class VideoEditorError(RuntimeError):
    """Assembly failure that names the phase and the output facts we have."""

    def __init__(
        self,
        message: str,
        *,
        phase: str,
        output: dict[str, Any] | None = None,
    ) -> None:
        self.phase = str(phase)
        self.output = dict(output or {})
        detail = f"[{self.phase}] {message}"
        if self.output:
            facts = ", ".join(f"{key}={value}" for key, value in self.output.items())
            detail = f"{detail} ({facts})"
        super().__init__(detail)


class VideoEditorCancelled(VideoEditorError):
    """Raised when an export stops before promoting a new artifact."""


def _seconds_for_ffmpeg(frames: int, fps: int) -> str:
    """Format a rational frame span for FFmpeg time options."""
    return f"{int(frames) / int(fps):.10f}"


def _rate_fraction(value: Any) -> Fraction:
    text = str(value or "0/1").strip()
    try:
        if "/" in text:
            numerator, denominator = text.split("/", 1)
            return Fraction(int(numerator), max(int(denominator), 1))
        return Fraction(text)
    except (TypeError, ValueError, ZeroDivisionError):
        return Fraction(0)


def plan_clip_frames(
    *,
    source_frames: int,
    source_fps: Fraction,
    output_fps: int,
    trim_start: float = 0.0,
    trim_end: float | None = None,
) -> tuple[int, int, int]:
    """Return ``(start_frame, end_frame, output_frames)`` in half-open source frames.

    ``end_frame`` is exclusive. When the trim covers the whole source and the
    rates match, ``output_frames == source_frames``.
    """
    frames = max(0, int(source_frames))
    rate = source_fps if isinstance(source_fps, Fraction) else _rate_fraction(source_fps)
    if frames < 1 or rate <= 0:
        raise VideoEditorError(
            "Source video has no countable frames",
            phase="probe",
            output={"source_frames": frames, "source_fps": str(rate)},
        )
    min_source = max(1, int(round(MIN_TRIM_SECONDS * float(rate))))
    start = int(round(max(0.0, float(trim_start)) * float(rate)))
    start = max(0, min(start, max(0, frames - min_source)))
    if trim_end is None:
        end = frames
    else:
        end = int(round(max(0.0, float(trim_end)) * float(rate)))
        end = max(start + min_source, min(end, frames))
        end = min(end, frames)
        if end <= start:
            end = min(frames, start + 1)
    span = max(1, end - start)
    if rate == Fraction(int(output_fps), 1):
        output_frames = span
    else:
        output_frames = max(1, int(round(span * int(output_fps) / rate)))
    return start, end, output_frames


def plan_transition_frames(
    duration: float,
    fps: int,
    left_frames: int,
    right_frames: int,
) -> int:
    """Snap an overlapping transition to whole frames, capped at 45% of each side."""
    max_overlap = min(max(0, int(left_frames) - 1), max(0, int(right_frames) - 1))
    if max_overlap < 1:
        return 0
    requested = max(MIN_TRIM_SECONDS, float(duration))
    capped_seconds = min(requested, (min(left_frames, right_frames) * 0.45) / fps)
    overlap = int(round(capped_seconds * fps))
    return max(1, min(overlap, max_overlap))


def count_decoded_video_frames(path: str, *, timeout: int = 120) -> int:
    """Count decoded video frames; container duration is not used."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-count_frames",
            "-show_entries",
            "stream=nb_read_frames,nb_frames",
            "-of",
            "json",
            path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
    )
    if result.returncode != 0:
        raise VideoEditorError(
            (result.stderr or "ffprobe could not count frames").strip()[-600:],
            phase="probe",
            output={"path": os.path.basename(path)},
        )
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise VideoEditorError(
            "ffprobe returned invalid frame information",
            phase="probe",
            output={"path": os.path.basename(path)},
        ) from exc
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    stream = streams[0] if streams else {}
    for key in ("nb_read_frames", "nb_frames"):
        raw = stream.get(key)
        if raw in (None, "", "N/A"):
            continue
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    raise VideoEditorError(
        "Could not count decoded video frames",
        phase="probe",
        output={"path": os.path.basename(path)},
    )


def probe_audio_timing(path: str, *, timeout: int = 60) -> dict[str, Any] | None:
    """Audio stream duration and sample rate from the stream, not the container."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "format=duration:stream=codec_type,duration,sample_rate,nb_frames",
            "-of",
            "json",
            path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
    )
    if result.returncode != 0:
        return None
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    if not audio:
        return None
    try:
        duration = float(audio.get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    if duration <= 0:
        try:
            duration = float((payload.get("format") or {}).get("duration") or 0)
        except (TypeError, ValueError):
            duration = 0.0
    try:
        sample_rate = int(audio.get("sample_rate") or 0)
    except (TypeError, ValueError):
        sample_rate = 0
    if duration <= 0 and sample_rate <= 0:
        return None
    return {
        "duration": duration,
        "sample_rate": sample_rate,
        "has_audio": True,
    }


def probe_assembly_source(path: str) -> dict[str, Any]:
    """Frame-accurate source facts for export. UI probe stays on ``probe_media``."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=index,codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames",
            "-of",
            "json",
            path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise VideoEditorError(
            (result.stderr or "ffprobe could not read this media file").strip()[-600:],
            phase="probe",
            output={"path": os.path.basename(path)},
        )
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise VideoEditorError(
            "ffprobe returned invalid media information",
            phase="probe",
            output={"path": os.path.basename(path)},
        ) from exc
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not video:
        raise VideoEditorError(
            "The selected file does not contain a video stream",
            phase="probe",
            output={"path": os.path.basename(path)},
        )
    rate = _rate_fraction(video.get("avg_frame_rate"))
    if rate <= 0:
        rate = _rate_fraction(video.get("r_frame_rate"))
    if rate <= 0:
        raise VideoEditorError(
            "The selected video has no readable frame rate",
            phase="probe",
            output={"path": os.path.basename(path)},
        )
    nb_frames = 0
    raw_frames = video.get("nb_frames")
    if raw_frames not in (None, "", "N/A"):
        try:
            nb_frames = int(raw_frames)
        except (TypeError, ValueError):
            nb_frames = 0
    if nb_frames < 1:
        nb_frames = count_decoded_video_frames(path)
    return {
        "nb_frames": nb_frames,
        "fps": rate,
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "has_audio": any(stream.get("codec_type") == "audio" for stream in streams),
        "duration": float(nb_frames / rate) if rate else 0.0,
    }


def _check_abort(abort_callback: AbortCallback | None, *, phase: str) -> None:
    if abort_callback is not None and abort_callback():
        raise VideoEditorCancelled(
            "Export cancelled before the artifact was finalised",
            phase=phase,
        )


def _promote_output(staging_path: str, output_path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    os.replace(staging_path, output_path)


def _validate_export_artifact(
    path: str,
    *,
    expected_frames: int,
    fps: int,
    expect_audio: bool = True,
    phase: str = "validate",
) -> dict[str, Any]:
    facts = {
        "path": os.path.basename(path),
        "expected_frames": int(expected_frames),
        "fps": int(fps),
    }
    if not os.path.isfile(path) or os.path.getsize(path) <= 0:
        raise VideoEditorError(
            "FFmpeg produced no output file",
            phase=phase,
            output=facts,
        )
    frames = count_decoded_video_frames(path)
    facts["frames"] = frames
    if frames != int(expected_frames):
        raise VideoEditorError(
            f"Assembled video has {frames} decoded frames, expected {expected_frames}",
            phase=phase,
            output=facts,
        )
    audio = probe_audio_timing(path)
    facts["has_audio"] = bool(audio)
    video_seconds = int(expected_frames) / int(fps)
    facts["video_seconds"] = video_seconds
    if expect_audio:
        if not audio:
            raise VideoEditorError(
                "Assembled video has no audio stream to compare",
                phase=phase,
                output=facts,
            )
        audio_seconds = float(audio["duration"] or 0)
        facts["audio_seconds"] = audio_seconds
        if audio_seconds + max(1.0 / fps, 0.05) < video_seconds:
            raise VideoEditorError(
                "Assembled audio is shorter than the video span",
                phase=phase,
                output=facts,
            )
        if audio_seconds > video_seconds + _AUDIO_PAD_TOLERANCE_SECONDS:
            raise VideoEditorError(
                "Assembled audio is much longer than the video span",
                phase=phase,
                output=facts,
            )
    return facts


def _source_sidecar_path(source: str) -> str:
    return os.path.splitext(source)[0] + ".meta.json"


def _without_nested_source_manifest(metadata: dict[str, Any]) -> dict[str, Any]:
    """Keep source metadata reproducible without recursively nesting masters."""
    cleaned = dict(metadata)
    params = cleaned.get("params")
    if not isinstance(params, dict):
        return cleaned
    clean_params = dict(params)
    editor = clean_params.get("video_editor")
    if isinstance(editor, dict) and "source_manifest" in editor:
        clean_editor = dict(editor)
        clean_editor.pop("source_manifest", None)
        clean_params["video_editor"] = clean_editor
    cleaned["params"] = clean_params
    return cleaned


def build_source_provenance_manifest(
    clips: list[dict[str, Any]],
    *,
    max_sidecar_bytes: int = SOURCE_SIDECAR_LIMIT_BYTES,
) -> dict[str, Any]:
    """Collect portable source metadata for one assembled editor timeline.

    ``resolved_path`` is accepted only as an already validated API-layer input
    and is never serialized. A missing or malformed sidecar is recorded per
    clip so one legacy source cannot prevent the final video from exporting.
    """
    entries: list[dict[str, Any]] = []
    for index, clip in enumerate(clips):
        resolved = str(clip.get("resolved_path") or "")
        source = str(clip.get("source") or "")
        entry: dict[str, Any] = {
            "index": index,
            "name": str(clip.get("name") or os.path.basename(source) or f"Clip {index + 1}"),
            "source": source,
            "resolved_filename": os.path.basename(resolved) if resolved else None,
        }
        if not resolved:
            entry.update({"sidecar_status": "unavailable", "sidecar_filename": None})
            entries.append(entry)
            continue

        sidecar_path = _source_sidecar_path(resolved)
        entry["sidecar_filename"] = os.path.basename(sidecar_path)
        try:
            size = os.path.getsize(sidecar_path)
            if size > max(1, int(max_sidecar_bytes)):
                entry.update({"sidecar_status": "too_large", "sidecar_bytes": size})
            else:
                with open(sidecar_path, encoding="utf-8") as handle:
                    metadata = json.load(handle)
                if not isinstance(metadata, dict):
                    raise ValueError("source sidecar root is not an object")
                entry.update({
                    "sidecar_status": "embedded",
                    "sidecar_bytes": size,
                    "metadata": _without_nested_source_manifest(metadata),
                })
        except FileNotFoundError:
            entry["sidecar_status"] = "missing"
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            entry.update({"sidecar_status": "unreadable", "sidecar_error": str(exc)[:300]})
        entries.append(entry)
    return {"version": 1, "clips": entries}


def is_interstitial_transition(transition: str) -> bool:
    """Return whether a transition inserts a full time-card between clips."""
    return transition in INTERSTITIAL_TRANSITIONS


def _run(
    command: list[str],
    *,
    timeout: int,
    label: str,
    phase: str = "ffmpeg",
    output: dict[str, Any] | None = None,
) -> None:
    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise VideoEditorError(
            f"{label} timed out after {timeout}s",
            phase=phase,
            output=output,
        ) from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Unknown FFmpeg error").strip()
        raise VideoEditorError(
            f"{label} failed: {detail[-1200:]}",
            phase=phase,
            output=output,
        )


def probe_media(path: str) -> dict[str, Any]:
    """Return the timing and primary stream information needed by the editor."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=index,codec_type,width,height,r_frame_rate,pix_fmt:stream_tags=alpha_mode",
            "-of",
            "json",
            path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError((result.stderr or "ffprobe could not read this media file").strip()[-600:])

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ValueError("ffprobe returned invalid media information") from exc

    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not video:
        raise ValueError("The selected file does not contain a video stream")

    duration = float((payload.get("format") or {}).get("duration") or 0)
    if duration <= 0:
        raise ValueError("The selected video has no readable duration")

    rate = str(video.get("r_frame_rate") or "0/1")
    try:
        numerator, denominator = rate.split("/", 1)
        fps = float(numerator) / max(float(denominator), 1)
    except (TypeError, ValueError, ZeroDivisionError):
        fps = 0

    pixel_format = str(video.get("pix_fmt") or "unknown").lower()
    alpha_formats = ("yuva", "rgba", "bgra", "argb", "abgr", "gbrap", "ya8", "ya16")
    video_tags = video.get("tags") if isinstance(video.get("tags"), dict) else {}
    alpha_mode = str(video_tags.get("ALPHA_MODE") or video_tags.get("alpha_mode") or "")

    return {
        "duration": round(duration, 4),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "fps": round(fps, 3),
        "has_audio": any(stream.get("codec_type") == "audio" for stream in streams),
        "pixel_format": pixel_format,
        "has_alpha": alpha_mode == "1" or any(marker in pixel_format for marker in alpha_formats),
    }


def probe_audio(path: str) -> dict[str, Any]:
    """Return duration for an audio source, rejecting files without audio."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration:stream=codec_type",
            "-of", "json", path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError((result.stderr or "ffprobe could not read this audio file").strip()[-600:])
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ValueError("ffprobe returned invalid audio information") from exc
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    if not any(stream.get("codec_type") == "audio" for stream in streams):
        raise ValueError("The selected file does not contain an audio stream")
    duration = float((payload.get("format") or {}).get("duration") or 0)
    if duration <= 0:
        raise ValueError("The selected audio has no readable duration")
    return {"duration": round(duration, 4), "has_audio": True}


def _mix_soundtrack(
    video_path: str,
    output_path: str,
    soundtrack: dict[str, Any],
    duration: float,
) -> None:
    """Mix one validated soundtrack over the assembled video's own audio."""
    source = str(soundtrack["resolved_path"])
    trim_start = max(0.0, float(soundtrack.get("trim_start") or 0))
    trim_end = float(soundtrack.get("trim_end") or 0)
    available = max(0.05, trim_end - trim_start) if trim_end > trim_start else duration
    mix_duration = duration if bool(soundtrack.get("loop")) else min(available, duration)
    raw_volume = soundtrack.get("volume")
    volume = max(0.0, min(2.0, float(1 if raw_volume is None else raw_volume)))
    command = ["ffmpeg", "-y", "-i", video_path]
    if bool(soundtrack.get("loop")):
        command.extend(["-stream_loop", "-1"])
    if trim_start:
        command.extend(["-ss", f"{trim_start:.6f}"])
    command.extend([
        "-i", source,
        "-filter_complex",
        (
            f"[1:a:0]atrim=duration={mix_duration:.6f},"
            f"asetpts=PTS-STARTPTS,volume={volume:.4f}[music];"
            "[0:a:0][music]amix=inputs=2:duration=first:dropout_transition=0[mixed]"
        ),
        "-map", "0:v:0", "-map", "[mixed]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", output_path,
    ])
    _run(
        command,
        timeout=1800,
        label="Mixing editor soundtrack",
        phase="soundtrack",
        output={"path": os.path.basename(output_path)},
    )


def extract_frame(
    source: str,
    destination: str,
    time_seconds: float,
) -> dict[str, Any]:
    """Extract one accurately-seeked native-resolution PNG from a video."""
    media = probe_media(source)
    fps = max(float(media.get("fps") or 0), 1.0)
    duration = float(media["duration"])
    requested = max(0.0, float(time_seconds))
    # Container duration can extend a fraction beyond the final video PTS.
    # Seeking to duration-1/fps may then return success but write no frame.
    end_margin_frames = 2 if requested >= duration - (1.0 / fps) else 1
    timestamp = max(0.0, min(requested, duration - (end_margin_frames / fps)))

    def capture(at: float) -> None:
        _run(
            [
                "ffmpeg",
                "-y",
                "-i",
                source,
                "-ss",
                f"{at:.6f}",
                "-map",
                "0:v:0",
                "-frames:v",
                "1",
                "-c:v",
                "png",
                destination,
            ],
            timeout=120,
            label=f"Capturing {os.path.basename(source)} at {at:.3f}s",
        )

    capture(timestamp)
    if not os.path.isfile(destination) or os.path.getsize(destination) <= 0:
        timestamp = max(0.0, duration - (3.0 / fps))
        capture(timestamp)
    if not os.path.isfile(destination) or os.path.getsize(destination) <= 0:
        raise RuntimeError(
            f"FFmpeg did not produce a frame from {os.path.basename(source)} "
            f"near {time_seconds:.3f}s."
        )
    return {
        "time": round(timestamp, 6),
        "width": int(media["width"]),
        "height": int(media["height"]),
    }


def _video_filter(width: int, height: int, fps: int, fit: str) -> str:
    return f"{_layout_filter(width, height, fit)},fps={fps}"


def _layout_filter(width: int, height: int, fit: str) -> str:
    if fit == "fill":
        sizing = (
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height}"
        )
    else:
        sizing = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"
        )
    return f"{sizing},setsar=1,format=yuv420p"


def _normalise_clip(
    source: str,
    destination: str,
    clip: dict[str, Any],
    width: int,
    height: int,
    fps: int,
) -> int:
    media = probe_assembly_source(source)
    trim_end_raw = clip.get("trim_end")
    try:
        trim_end = float(trim_end_raw) if trim_end_raw not in (None, "", 0, 0.0) else None
    except (TypeError, ValueError):
        trim_end = None
    start_frame, end_frame, output_frames = plan_clip_frames(
        source_frames=int(media["nb_frames"]),
        source_fps=media["fps"],
        output_fps=fps,
        trim_start=float(clip.get("trim_start") or 0),
        trim_end=trim_end,
    )
    volume = 0.0 if clip.get("muted") else max(0.0, min(float(clip.get("volume", 1)), 2.0))
    fit = "fill" if clip.get("fit") == "fill" else "fit"
    video_span = _seconds_for_ffmpeg(output_frames, fps)
    source_rate = float(media["fps"])
    audio_start = start_frame / source_rate
    audio_end = end_frame / source_rate
    video_graph = (
        f"{_layout_filter(width, height, fit)},"
        f"trim=start_frame={start_frame}:end_frame={end_frame},setpts=PTS-STARTPTS,"
        f"fps={fps},tpad=stop_mode=clone:stop=2,"
        f"trim=end_frame={output_frames},setpts=N/{fps}/TB"
    )
    audio_graph = (
        f"atrim=start={audio_start:.10f}:end={audio_end:.10f},asetpts=PTS-STARTPTS,"
        f"aresample=48000:async=1:first_pts=0,volume={volume:.4f},"
        f"apad,atrim=duration={video_span}"
    )
    command = ["ffmpeg", "-y", "-i", source]
    facts = {
        "path": os.path.basename(source),
        "start_frame": start_frame,
        "end_frame": end_frame,
        "output_frames": output_frames,
        "fps": fps,
    }
    if media["has_audio"]:
        command.extend(
            [
                "-filter_complex",
                f"[0:v:0]{video_graph}[vout];[0:a:0]{audio_graph}[aout]",
                "-map",
                "[vout]",
                "-map",
                "[aout]",
            ]
        )
    else:
        command.extend(
            [
                "-f",
                "lavfi",
                "-t",
                video_span,
                "-i",
                "anullsrc=r=48000:cl=stereo",
                "-filter_complex",
                (
                    f"[0:v:0]{video_graph}[vout];"
                    f"[1:a:0]volume={volume:.4f},atrim=duration={video_span},"
                    "asetpts=PTS-STARTPTS[aout]"
                ),
                "-map",
                "[vout]",
                "-map",
                "[aout]",
            ]
        )
    command.extend(
        [
            "-frames:v",
            str(output_frames),
            "-fps_mode",
            "cfr",
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-muxpreload",
            "0",
            "-muxdelay",
            "0",
            destination,
        ]
    )
    _run(
        command,
        timeout=max(300, int(output_frames / fps * 20) + 30),
        label=f"Preparing {os.path.basename(source)}",
        phase="normalise",
        output=facts,
    )
    return output_frames


def _concat_without_transition(
    segments: list[str],
    output_path: str,
    *,
    fps: int | None = None,
    expected_frames: int | None = None,
) -> None:
    if len(segments) == 1:
        shutil.copy2(segments[0], output_path)
        return

    list_path = os.path.join(os.path.dirname(segments[0]), "concat.txt")
    with open(list_path, "w", encoding="utf-8") as handle:
        for segment in segments:
            escaped = os.path.abspath(segment).replace("\\", "/").replace("'", "'\\''")
            handle.write(f"file '{escaped}'\n")
    command = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list_path,
        "-c",
        "copy",
        "-fflags",
        "+genpts",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        output_path,
    ]
    _run(
        command,
        timeout=1200,
        label="Joining clips",
        phase="concat",
        output={"segments": len(segments), "expected_frames": expected_frames},
    )


def _concat_with_transitions(
    segments: list[str],
    durations: list[float],
    output_path: str,
    transitions: list[dict[str, Any]],
    *,
    fps: int | None = None,
    frame_counts: list[int] | None = None,
) -> None:
    command = ["ffmpeg", "-y"]
    for segment in segments:
        command.extend(["-i", segment])

    output_fps = int(fps or 30)
    counts = list(frame_counts) if frame_counts is not None else [
        max(1, int(round(float(duration) * output_fps))) for duration in durations
    ]
    filters: list[str] = []
    for index, count in enumerate(counts):
        filters.append(
            f"[{index}:v]fps={output_fps},setpts=N/{output_fps}/TB,"
            f"tpad=stop_mode=clone:stop=2,trim=end_frame={count},"
            f"setpts=N/{output_fps}/TB[v{index}s]"
        )
        filters.append(
            f"[{index}:a]aresample=48000,asetpts=PTS-STARTPTS[a{index}s]"
        )
    video_label = "v0s"
    audio_label = "a0s"
    running_frames = counts[0]
    for index in range(1, len(segments)):
        out_video = f"v{index}"
        out_audio = f"a{index}"
        transition = transitions[index - 1]
        transition_type = str(transition.get("type") or "none")
        fade_duration = float(transition.get("duration") or 0)
        if transition_type == "none" or fade_duration <= 0:
            filters.append(
                f"[{video_label}][v{index}s]concat=n=2:v=1:a=0[{out_video}]"
            )
            filters.append(
                f"[{audio_label}][a{index}s]concat=n=2:v=0:a=1[{out_audio}]"
            )
            running_frames += counts[index]
        else:
            transition_name = {
                "crossfade": "fade",
                "fade-black": "fadeblack",
                "wipe-left": "wipeleft",
                "slide-left": "slideleft",
                "slide-right": "slideright",
                "circle-open": "circleopen",
                "dissolve": "dissolve",
                "pixelize": "pixelize",
                "blur": "hblur",
                "zoom-in": "zoomin",
            }.get(transition_type, "fade")
            fade_frames = max(1, int(round(fade_duration * output_fps)))
            fade_frames = min(fade_frames, max(1, running_frames - 1), max(1, counts[index] - 1))
            offset = max(0, running_frames - fade_frames)
            fade_seconds = _seconds_for_ffmpeg(fade_frames, output_fps)
            offset_seconds = _seconds_for_ffmpeg(offset, output_fps)
            filters.append(
                f"[{video_label}][v{index}s]xfade=transition={transition_name}:"
                f"duration={fade_seconds}:offset={offset_seconds}[{out_video}]"
            )
            filters.append(
                f"[{audio_label}][a{index}s]acrossfade=d={fade_seconds}:"
                f"c1=tri:c2=tri[{out_audio}]"
            )
            running_frames += counts[index] - fade_frames
        video_label = out_video
        audio_label = out_audio

    command.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            f"[{video_label}]",
            "-map",
            f"[{audio_label}]",
            "-frames:v",
            str(running_frames),
            "-fps_mode",
            "cfr",
            "-r",
            str(output_fps),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            output_path,
        ]
    )
    _run(
        command,
        timeout=max(1200, int(sum(durations) * 30)),
        label="Rendering transitions",
        phase="concat",
        output={"segments": len(segments), "expected_frames": running_frames, "fps": output_fps},
    )


def _load_time_card_font(size: int, *, bold: bool = True):
    """Load a broadly available font without making the editor platform-specific."""
    from PIL import ImageFont

    font_names = (
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf",
        "Arial Bold.ttf" if bold else "Arial.ttf",
    )
    font_paths = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/Library/Fonts/Arial.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    )
    for candidate in (*font_names, *font_paths):
        try:
            return ImageFont.truetype(candidate, max(10, size))
        except OSError:
            continue
    return ImageFont.load_default()


def normalise_time_card_text(value: Any) -> str:
    """Keep intentional line breaks while making card text safe and predictable."""
    raw = str(value or "Momentos después…").replace("\r\n", "\n").replace("\r", "\n")
    lines = [" ".join(line.split()) for line in raw.split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)[:240].rstrip() or "Momentos después…"


def _time_card_text_width(draw, text: str, font) -> int:
    left, _top, right, _bottom = draw.textbbox((0, 0), text, font=font)
    return right - left


def _split_time_card_word(draw, word: str, font, max_width: int) -> list[str]:
    """Split an unusually long token so it cannot be clipped at the card edge."""
    pieces: list[str] = []
    current = ""
    for character in word:
        candidate = current + character
        if current and _time_card_text_width(draw, candidate, font) > max_width:
            pieces.append(current)
            current = character
        else:
            current = candidate
    if current:
        pieces.append(current)
    return pieces or [word]


def _wrap_time_card_text(draw, text: str, font, max_width: int) -> list[str]:
    """Wrap to the available width without discarding user-authored newlines."""
    lines: list[str] = []
    for authored_line in normalise_time_card_text(text).split("\n"):
        words = authored_line.split()
        if not words:
            lines.append("")
            continue
        current = ""
        for word in words:
            pieces = (
                [word]
                if _time_card_text_width(draw, word, font) <= max_width
                else _split_time_card_word(draw, word, font, max_width)
            )
            for piece in pieces:
                candidate = f"{current} {piece}" if current else piece
                if current and _time_card_text_width(draw, candidate, font) > max_width:
                    lines.append(current)
                    current = piece
                elif not current and _time_card_text_width(draw, piece, font) > max_width:
                    lines.append(piece)
                    current = ""
                else:
                    current = candidate
        if current:
            lines.append(current)
    return lines or ["Momentos después…"]


def _fit_time_card_text(
    draw,
    text: str,
    *,
    max_width: int,
    max_height: int,
    max_size: int,
    min_size: int,
    stroke_width: int = 0,
):
    for size in range(max_size, min_size - 1, -2):
        spacing = max(2, round(size * 0.16))
        font = _load_time_card_font(size)
        lines = _wrap_time_card_text(draw, text, font, max_width)
        rendered = "\n".join(lines)
        box = draw.multiline_textbbox(
            (0, 0), rendered, font=font, spacing=spacing, align="center", stroke_width=stroke_width,
        )
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            return font, rendered, spacing
    font = _load_time_card_font(min_size)
    spacing = max(2, round(min_size * 0.16))
    return font, "\n".join(_wrap_time_card_text(draw, text, font, max_width)), spacing


def _draw_time_card(
    destination: str,
    *,
    style: str,
    text: str,
    text_size: float = 100,
    width: int,
    height: int,
) -> None:
    """Draw an original, reusable time-card without external copyrighted assets."""
    from PIL import Image, ImageDraw

    safe_text = normalise_time_card_text(text)
    text_scale = max(50.0, min(160.0, float(text_size or 100))) / 100
    image = Image.new("RGB", (width, height), "#111827")
    draw = ImageDraw.Draw(image)
    scale = min(width, height)

    if style == "later-clock":
        top = (18, 32, 55)
        bottom = (4, 10, 22)
        for y in range(height):
            ratio = y / max(height - 1, 1)
            colour = tuple(round(top[channel] * (1 - ratio) + bottom[channel] * ratio) for channel in range(3))
            draw.line((0, y, width, y), fill=colour)
        for radius, alpha_colour in (
            (round(scale * .62), (31, 71, 105)),
            (round(scale * .46), (21, 52, 80)),
        ):
            draw.ellipse(
                (width * .13 - radius, height * .3 - radius, width * .13 + radius, height * .3 + radius),
                outline=alpha_colour,
                width=max(2, round(scale * .006)),
            )

        landscape = width >= height
        clock_radius = round(scale * (.26 if landscape else .22))
        clock_x = round(width * (.28 if landscape else .5))
        clock_y = round(height * (.5 if landscape else .29))
        shadow = round(scale * .018)
        draw.ellipse(
            (clock_x - clock_radius + shadow, clock_y - clock_radius + shadow,
             clock_x + clock_radius + shadow, clock_y + clock_radius + shadow),
            fill="#020617",
        )
        draw.ellipse(
            (clock_x - clock_radius, clock_y - clock_radius,
             clock_x + clock_radius, clock_y + clock_radius),
            fill="#f8fafc",
            outline="#fbbf24",
            width=max(5, round(scale * .014)),
        )
        for tick in range(60):
            angle = math.radians(tick * 6 - 90)
            outer = clock_radius * .88
            inner = clock_radius * (.75 if tick % 5 == 0 else .82)
            stroke = max(2, round(scale * (.007 if tick % 5 == 0 else .003)))
            draw.line(
                (
                    clock_x + math.cos(angle) * inner,
                    clock_y + math.sin(angle) * inner,
                    clock_x + math.cos(angle) * outer,
                    clock_y + math.sin(angle) * outer,
                ),
                fill="#172554",
                width=stroke,
            )
        for angle_degrees, length, colour, stroke in (
            (-52, .48, "#0f172a", .026),
            (28, .68, "#0f172a", .018),
            (132, .73, "#ef4444", .008),
        ):
            angle = math.radians(angle_degrees)
            draw.line(
                (clock_x, clock_y,
                 clock_x + math.cos(angle) * clock_radius * length,
                 clock_y + math.sin(angle) * clock_radius * length),
                fill=colour,
                width=max(2, round(scale * stroke)),
            )
        pin = max(5, round(scale * .018))
        draw.ellipse((clock_x - pin, clock_y - pin, clock_x + pin, clock_y + pin), fill="#fbbf24")

        if landscape:
            text_box = (round(width * .54), round(height * .18), round(width * .92), round(height * .82))
        else:
            text_box = (round(width * .10), round(height * .55), round(width * .90), round(height * .88))
        font, rendered, spacing = _fit_time_card_text(
            draw,
            safe_text,
            max_width=text_box[2] - text_box[0],
            max_height=text_box[3] - text_box[1],
            max_size=max(12, round(scale * .105 * text_scale)),
            min_size=max(10, round(scale * .025)),
        )
        box = draw.multiline_textbbox((0, 0), rendered, font=font, spacing=spacing, align="center")
        x = (text_box[0] + text_box[2] - (box[2] - box[0])) / 2 - box[0]
        y = (text_box[1] + text_box[3] - (box[3] - box[1])) / 2 - box[1]
        draw.multiline_text((x, y), rendered, font=font, fill="#f8fafc", spacing=spacing, align="center")

    elif style == "later-tropical":
        image.paste("#087f8c", (0, 0, width, height))
        rng = random.Random(f"{safe_text}:{width}:{height}")
        palette = ("#f4d35e", "#ee964b", "#f95738", "#74c69d", "#0b4f6c", "#f6f7d7")
        for _index in range(26):
            cx = rng.randint(-round(scale * .1), width + round(scale * .1))
            cy = rng.randint(-round(scale * .1), height + round(scale * .1))
            radius = rng.randint(max(8, round(scale * .025)), max(14, round(scale * .11)))
            colour = rng.choice(palette)
            if rng.random() < .55:
                petals = rng.choice((5, 6, 8))
                for petal in range(petals):
                    angle = math.radians(petal * 360 / petals)
                    px = cx + math.cos(angle) * radius * .62
                    py = cy + math.sin(angle) * radius * .62
                    pr = radius * .42
                    draw.ellipse((px - pr, py - pr, px + pr, py + pr), fill=colour, outline="#073b4c")
                draw.ellipse((cx - radius * .28, cy - radius * .28, cx + radius * .28, cy + radius * .28), fill="#f4d35e")
            else:
                points = []
                for point in range(10):
                    angle = math.radians(point * 36 - 90)
                    distance = radius if point % 2 == 0 else radius * .45
                    points.append((cx + math.cos(angle) * distance, cy + math.sin(angle) * distance))
                draw.polygon(points, fill=colour, outline="#073b4c")
        veil = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        veil_draw = ImageDraw.Draw(veil)
        pad_x, pad_y = round(width * .08), round(height * .18)
        veil_draw.rounded_rectangle(
            (pad_x, pad_y, width - pad_x, height - pad_y),
            radius=max(14, round(scale * .035)),
            fill=(4, 59, 68, 178),
            outline=(246, 247, 215, 210),
            width=max(3, round(scale * .008)),
        )
        image = Image.alpha_composite(image.convert("RGBA"), veil).convert("RGB")
        draw = ImageDraw.Draw(image)
        stroke_width = max(2, round(scale * .009))
        font, rendered, spacing = _fit_time_card_text(
            draw,
            safe_text.upper(),
            max_width=round(width * .72),
            max_height=round(height * .48),
            max_size=max(12, round(scale * .13 * text_scale)),
            min_size=max(10, round(scale * .025)),
            stroke_width=stroke_width,
        )
        box = draw.multiline_textbbox(
            (0, 0), rendered, font=font, spacing=spacing, align="center", stroke_width=stroke_width,
        )
        x = (width - (box[2] - box[0])) / 2 - box[0]
        y = (height - (box[3] - box[1])) / 2 - box[1]
        draw.multiline_text(
            (x, y), rendered, font=font, fill="#f6f7d7", spacing=spacing,
            align="center", stroke_width=stroke_width, stroke_fill="#073b4c",
        )

    else:
        image.paste("#170f0a", (0, 0, width, height))
        for y in range(height):
            ratio = abs((y / max(height - 1, 1)) - .5) * 2
            shade = round(31 - ratio * 16)
            draw.line((0, y, width, y), fill=(shade, round(shade * .73), round(shade * .46)))
        margin = round(scale * .07)
        line_colour = "#c9a96e"
        draw.rectangle((margin, margin, width - margin, height - margin), outline=line_colour, width=max(2, round(scale * .005)))
        draw.rectangle((margin * 1.35, margin * 1.35, width - margin * 1.35, height - margin * 1.35), outline="#685238", width=max(1, round(scale * .002)))
        ornament_y = round(height * .28)
        draw.line((width * .18, ornament_y, width * .42, ornament_y), fill=line_colour, width=max(2, round(scale * .004)))
        draw.line((width * .58, ornament_y, width * .82, ornament_y), fill=line_colour, width=max(2, round(scale * .004)))
        diamond = round(scale * .018)
        draw.polygon(((width / 2, ornament_y - diamond), (width / 2 + diamond, ornament_y),
                      (width / 2, ornament_y + diamond), (width / 2 - diamond, ornament_y)), fill=line_colour)
        font, rendered, spacing = _fit_time_card_text(
            draw,
            safe_text.upper(),
            max_width=round(width * .68),
            max_height=round(height * .38),
            max_size=max(12, round(scale * .105 * text_scale)),
            min_size=max(10, round(scale * .025)),
        )
        box = draw.multiline_textbbox((0, 0), rendered, font=font, spacing=spacing, align="center")
        x = (width - (box[2] - box[0])) / 2 - box[0]
        y = (height - (box[3] - box[1])) / 2 - box[1] + height * .04
        draw.multiline_text((x, y), rendered, font=font, fill="#f4e8ce", spacing=spacing, align="center")

    image.save(destination, format="PNG", optimize=True)


def _render_time_card_segment(
    destination: str,
    *,
    style: str,
    text: str,
    text_size: float,
    duration: float,
    width: int,
    height: int,
    fps: int,
) -> None:
    card_path = f"{destination}.png"
    _draw_time_card(
        card_path,
        style=style,
        text=text,
        text_size=text_size,
        width=width,
        height=height,
    )
    frames = max(1, int(round(float(duration) * fps)))
    span = _seconds_for_ffmpeg(frames, fps)
    _run(
        [
            "ffmpeg", "-y", "-loop", "1", "-i", card_path,
            "-f", "lavfi", "-t", span,
            "-i", "anullsrc=r=48000:cl=stereo",
            "-map", "0:v:0", "-map", "1:a:0",
            "-vf", (
                f"fps={fps},tpad=stop_mode=clone:stop=2,"
                f"trim=end_frame={frames},setpts=N/{fps}/TB,setsar=1,format=yuv420p"
            ),
            "-frames:v", str(frames),
            "-fps_mode", "cfr", "-r", str(fps),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
            destination,
        ],
        timeout=max(180, int(frames / fps * 30) + 30),
        label="Rendering time-card transition",
        phase="time_card",
        output={"frames": frames, "fps": fps},
    )


def _materialise_time_cards(
    segments: list[str],
    durations: list[float],
    transitions: list[dict[str, Any]],
    *,
    temp_dir: str,
    width: int,
    height: int,
    fps: int,
) -> tuple[list[str], list[float], list[dict[str, Any]]]:
    """Expand special boundaries into ordinary, concat-safe video segments."""
    if not segments:
        return [], [], []
    expanded_segments = [segments[0]]
    expanded_durations = [durations[0]]
    expanded_transitions: list[dict[str, Any]] = []
    for index, transition in enumerate(transitions):
        if is_interstitial_transition(str(transition.get("type") or "none")):
            card_path = os.path.join(temp_dir, f"time_card_{index:04d}.mp4")
            _render_time_card_segment(
                card_path,
                style=str(transition["type"]),
                text=str(transition.get("text") or "Momentos después…"),
                text_size=float(transition.get("text_size") or 100),
                duration=float(transition["duration"]),
                width=width,
                height=height,
                fps=fps,
            )
            expanded_transitions.append({"type": "none", "duration": 0.0})
            expanded_segments.append(card_path)
            expanded_durations.append(float(transition["duration"]))
            expanded_transitions.append({"type": "none", "duration": 0.0})
            expanded_segments.append(segments[index + 1])
            expanded_durations.append(durations[index + 1])
        else:
            expanded_transitions.append(transition)
            expanded_segments.append(segments[index + 1])
            expanded_durations.append(durations[index + 1])
    return expanded_segments, expanded_durations, expanded_transitions


def _expected_concat_frames(
    frame_counts: list[int],
    transitions: list[dict[str, Any]],
    fps: int,
) -> int:
    if not frame_counts:
        return 0
    total = int(frame_counts[0])
    for index, transition in enumerate(transitions):
        incoming = int(frame_counts[index + 1])
        kind = str(transition.get("type") or "none")
        fade = float(transition.get("duration") or 0)
        if kind == "none" or fade <= 0:
            total += incoming
        elif is_interstitial_transition(kind):
            total += max(1, int(round(fade * fps))) + incoming
        else:
            total += incoming - max(1, int(round(fade * fps)))
    return total


def render_project(
    clips: list[dict[str, Any]],
    output_path: str,
    *,
    width: int,
    height: int,
    fps: int,
    soundtrack: dict[str, Any] | None = None,
    progress: ProgressCallback | None = None,
    abort_callback: AbortCallback | None = None,
) -> dict[str, Any]:
    """Normalise, trim and assemble clips into a shareable H.264 MP4."""
    if not clips:
        raise ValueError("Add at least one video clip")
    if width < 240 or height < 240 or width > 3840 or height > 3840:
        raise ValueError("Output resolution must be between 240 and 3840 pixels")
    if width % 2 or height % 2:
        raise ValueError("Output width and height must be even numbers")
    if fps not in SUPPORTED_FPS:
        raise ValueError("Unsupported frame rate")

    destination = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    total_stages = len(clips) + 1
    with tempfile.TemporaryDirectory(
        prefix=".video_editor_",
        dir=os.path.dirname(destination),
    ) as temp_dir:
        segments: list[str] = []
        clip_frames: list[int] = []
        durations: list[float] = []
        for index, clip in enumerate(clips):
            _check_abort(abort_callback, phase="normalise")
            if progress:
                progress(
                    round((index / total_stages) * 100),
                    f"Preparing clip {index + 1} of {len(clips)}…",
                )
            segment = os.path.join(temp_dir, f"segment_{index:04d}.mp4")
            frames = _normalise_clip(
                str(clip["resolved_path"]),
                segment,
                clip,
                width,
                height,
                fps,
            )
            clip_frames.append(frames)
            durations.append(frames / fps)
            segments.append(segment)

        _check_abort(abort_callback, phase="concat")
        if progress:
            progress(
                round((len(clips) / total_stages) * 100),
                "Joining clips and writing the final MP4…",
            )
        transitions: list[dict[str, Any]] = []
        for index in range(max(0, len(clips) - 1)):
            transition_type = str(clips[index].get("transition") or "none")
            requested_duration = float(clips[index].get("transition_duration") or 0.4)
            actual_duration = max(0.5, min(requested_duration, 5.0)) if is_interstitial_transition(transition_type) else (
                max(
                    MIN_TRIM_SECONDS,
                    min(requested_duration, durations[index] * 0.45, durations[index + 1] * 0.45),
                )
                if transition_type != "none"
                else 0.0
            )
            if transition_type != "none" and not is_interstitial_transition(transition_type):
                fade_frames = plan_transition_frames(
                    actual_duration, fps, clip_frames[index], clip_frames[index + 1],
                )
                actual_duration = fade_frames / fps if fade_frames else 0.0
            transitions.append({
                "type": transition_type,
                "duration": actual_duration,
                "text": normalise_time_card_text(clips[index].get("transition_text")),
                "text_size": max(50.0, min(160.0, float(clips[index].get("transition_text_size") or 100))),
            })

        if any(is_interstitial_transition(item["type"]) for item in transitions):
            if progress:
                progress(88, "Creating time-card transitions…")
            render_segments, render_durations, render_transitions = _materialise_time_cards(
                segments,
                durations,
                transitions,
                temp_dir=temp_dir,
                width=width,
                height=height,
                fps=fps,
            )
        else:
            render_segments, render_durations, render_transitions = segments, durations, transitions

        render_frame_counts = [
            max(1, int(round(float(duration) * fps))) for duration in render_durations
        ]
        expected_frames = _expected_concat_frames(render_frame_counts, render_transitions, fps)
        assembled_path = os.path.join(temp_dir, "assembled.mp4")
        if not any(item["type"] != "none" for item in render_transitions) or len(render_segments) == 1:
            _concat_without_transition(
                render_segments,
                assembled_path,
                fps=fps,
                expected_frames=expected_frames,
            )
        else:
            _concat_with_transitions(
                render_segments,
                render_durations,
                assembled_path,
                render_transitions,
                fps=fps,
                frame_counts=render_frame_counts,
            )

        staging_path = assembled_path
        duration_seconds = expected_frames / fps
        if soundtrack:
            _check_abort(abort_callback, phase="soundtrack")
            if progress:
                progress(96, "Mixing external soundtrack…")
            mixed_path = os.path.join(temp_dir, "final.mp4")
            _mix_soundtrack(assembled_path, mixed_path, soundtrack, duration_seconds)
            staging_path = mixed_path

        if progress:
            progress(98, "Validating exported frames and audio…")
        accounting = _validate_export_artifact(
            staging_path,
            expected_frames=expected_frames,
            fps=fps,
            expect_audio=True,
            phase="validate",
        )
        _check_abort(abort_callback, phase="validate")
        _promote_output(staging_path, destination)

    if progress:
        progress(100, "Video export complete")
    return {
        "duration": round(duration_seconds, 3),
        "frames": expected_frames,
        "fps": fps,
        "clip_count": len(clips),
        "transitions": transitions,
        "audio_seconds": accounting.get("audio_seconds"),
    }


def _comic_preview_video_filter(
    *,
    duration: float,
    width: int,
    height: int,
    fps: int,
    motion: str,
) -> str:
    """Build a restrained FFmpeg filter that never crops comic artwork."""
    frames = max(2, round(duration * fps))
    progress = f"on/{max(frames - 1, 1)}"
    if motion == "pull-out":
        zoom = f"1.04-0.04*{progress}"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif motion == "pan-left":
        zoom = "1.04"
        x = f"(iw-iw/zoom)*(1-{progress})"
        y = "ih/2-(ih/zoom/2)"
    elif motion == "pan-right":
        zoom = "1.04"
        x = f"(iw-iw/zoom)*{progress}"
        y = "ih/2-(ih/zoom/2)"
    elif motion == "none":
        zoom = "1"
        x = "0"
        y = "0"
    else:
        zoom = f"1+0.04*{progress}"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"zoompan=z='{zoom}':x='{x}':y='{y}':d={frames}:s={width}x{height}:fps={fps},"
        "setsar=1,format=yuv420p"
    )


def _render_still_segment(
    source: str,
    destination: str,
    *,
    duration: float,
    width: int,
    height: int,
    fps: int,
    motion: str,
) -> None:
    """Turn one lettered comic panel into a silent storyboard-preview shot."""
    video_filter = _comic_preview_video_filter(
        duration=duration,
        width=width,
        height=height,
        fps=fps,
        motion=motion,
    )
    frames = max(2, round(duration * fps))
    span = _seconds_for_ffmpeg(frames, fps)
    _run(
        [
            "ffmpeg", "-y", "-loop", "1", "-i", source,
            "-f", "lavfi", "-t", span,
            "-i", "anullsrc=r=48000:cl=stereo",
            "-map", "0:v:0", "-map", "1:a:0",
            "-vf", video_filter,
            "-frames:v", str(frames),
            "-fps_mode", "cfr", "-r", str(fps),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-c:a", "aac", "-b:a", "128k", destination,
        ],
        timeout=max(180, int(frames / fps * 30) + 30),
        label=f"Animating {os.path.basename(source)}",
        phase="animatic",
        output={"path": os.path.basename(source), "frames": frames, "fps": fps},
    )


def render_comic_animatic(
    panels: list[dict[str, Any]],
    output_path: str,
    *,
    width: int,
    height: int,
    fps: int = 30,
    transition: str = "none",
    transition_duration: float = 0.35,
    progress: ProgressCallback | None = None,
    abort_callback: AbortCallback | None = None,
) -> dict[str, Any]:
    """Render ordered, already-lettered comic panels as a cinematic animatic."""
    if not panels:
        raise ValueError("The comic has no panels to animate")
    if width < 240 or height < 240 or width > 3840 or height > 3840 or width % 2 or height % 2:
        raise ValueError("Invalid animatic resolution")
    if fps not in SUPPORTED_FPS:
        raise ValueError("Unsupported animatic frame rate")
    destination = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".comic_animatic_",
        dir=os.path.dirname(destination),
    ) as temp_dir:
        segments: list[str] = []
        durations: list[float] = []
        frame_counts: list[int] = []
        for index, panel in enumerate(panels):
            _check_abort(abort_callback, phase="animatic")
            if progress:
                progress(round(index / (len(panels) + 1) * 100), f"Animating panel {index + 1} of {len(panels)}…")
            duration = max(0.8, min(float(panel.get("duration") or 3.0), 20.0))
            frames = max(2, round(duration * fps))
            panel_path = os.path.join(temp_dir, f"panel_{index:04d}.mp4")
            _render_still_segment(
                str(panel["resolved_path"]), panel_path, duration=duration,
                width=width, height=height, fps=fps,
                motion=str(panel.get("motion") or "none"),
            )
            segments.append(panel_path)
            durations.append(frames / fps)
            frame_counts.append(frames)
        transitions = []
        for index in range(max(0, len(segments) - 1)):
            if transition == "none":
                fade = 0.0
            else:
                fade_frames = plan_transition_frames(
                    transition_duration, fps, frame_counts[index], frame_counts[index + 1],
                )
                fade = fade_frames / fps if fade_frames else 0.0
            transitions.append({"type": transition, "duration": fade})
        assembled_path = os.path.join(temp_dir, "assembled.mp4")
        expected_frames = _expected_concat_frames(frame_counts, transitions, fps)
        if len(segments) == 1 or transition == "none":
            _concat_without_transition(
                segments,
                assembled_path,
                fps=fps,
                expected_frames=expected_frames,
            )
        else:
            _concat_with_transitions(
                segments,
                durations,
                assembled_path,
                transitions,
                fps=fps,
                frame_counts=frame_counts,
            )
        accounting = _validate_export_artifact(
            assembled_path,
            expected_frames=expected_frames,
            fps=fps,
            expect_audio=True,
            phase="validate",
        )
        _check_abort(abort_callback, phase="validate")
        _promote_output(assembled_path, destination)
    if progress:
        progress(100, "Comic animatic complete")
    return {
        "duration": round(expected_frames / fps, 3),
        "frames": expected_frames,
        "fps": fps,
        "clip_count": len(segments),
        "transitions": transitions,
        "audio_seconds": accounting.get("audio_seconds"),
    }
