"""Compatibility helpers adapted from WanGP 362c3467 (2026-09-07).

Kept local to the optional runtime so existing LTX geometry is unchanged.
See app/licenses/wangp-1272.txt and shared/wangp1272/upstream.json.
"""
from contextlib import contextmanager
import math
import numpy as np
import soundfile as sf

@contextmanager
def attention_shared_state(default_attention=None):
    from mmgp import offload
    from shared.attention import get_default_attention_mode
    sentinel = object()
    previous = offload.shared_state.get("_attention", sentinel)
    if previous is sentinel or previous == "auto":
        offload.shared_state["_attention"] = default_attention or get_default_attention_mode()
    try:
        yield
    finally:
        if previous is sentinel:
            offload.shared_state.pop("_attention", None)
        else:
            offload.shared_state["_attention"] = previous

def parse_outpainting_ratio(outpainting_ratio):
    ratio = "" if outpainting_ratio is None else str(outpainting_ratio).strip()
    if len(ratio) == 0:
        return None
    ratio = ratio.split(":")
    if len(ratio) != 2:
        return None
    try:
        width_ratio, height_ratio = float(ratio[0]), float(ratio[1])
    except (TypeError, ValueError):
        return None
    return None if width_ratio <= 0 or height_ratio <= 0 else width_ratio / height_ratio

def get_outpainting_dims(video_guide_outpainting, video_guide_outpainting_ratio = ""):
    if video_guide_outpainting is None:
        return None
    video_guide_outpainting = str(video_guide_outpainting).strip()
    if video_guide_outpainting.startswith("#") :
        return None
    if video_guide_outpainting == "0 0 0 0" or len(video_guide_outpainting) == 0:
        return [0, 0, 0, 0] if len(video_guide_outpainting_ratio) else None
    import math
    try:
        values = [float(value) for value in video_guide_outpainting.split()]
    except ValueError as error:
        raise ValueError('Outpainting needs four nonnegative percentages: top bottom left right') from error
    if len(values) != 4 or any(not math.isfinite(value) or value < 0 for value in values):
        raise ValueError('Outpainting needs four finite nonnegative percentages: top bottom left right')
    return values if any(values) else None

def _split_outpainting_padding(total_padding, before_weight, after_weight):
    total_padding = max(0, int(total_padding))
    if total_padding == 0:
        return 0, 0
    before_weight = max(0.0, float(before_weight))
    after_weight = max(0.0, float(after_weight))
    if before_weight == after_weight:
        before_padding = total_padding // 2
    elif before_weight == 0:
        before_padding = 0
    elif after_weight == 0:
        before_padding = total_padding
    else:
        before_padding = round(total_padding * before_weight / (before_weight + after_weight))
    before_padding = max(0, min(total_padding, int(before_padding)))
    return before_padding, total_padding - before_padding

def resolve_outpainting_dims(frame_height, frame_width, outpainting_dims, outpainting_ratio = ""):
    target_ratio = parse_outpainting_ratio(outpainting_ratio)
    if outpainting_dims is None:
        return None if target_ratio is None else [0.0, 0.0, 0.0, 0.0]
    outpainting_top, outpainting_bottom, outpainting_left, outpainting_right = [max(0.0, float(v)) for v in outpainting_dims]
    if target_ratio is None or frame_height <= 0 or frame_width <= 0:
        return [outpainting_top, outpainting_bottom, outpainting_left, outpainting_right]

    source_ratio = frame_width / frame_height
    if source_ratio < target_ratio:
        total_padding = max(0, round(frame_height * target_ratio - frame_width))
        left_padding, right_padding = _split_outpainting_padding(total_padding, outpainting_left, outpainting_right)
        return [0.0, 0.0, 100.0 * left_padding / frame_width, 100.0 * right_padding / frame_width]
    if source_ratio > target_ratio:
        total_padding = max(0, round(frame_width / target_ratio - frame_height))
        top_padding, bottom_padding = _split_outpainting_padding(total_padding, outpainting_top, outpainting_bottom)
        return [100.0 * top_padding / frame_height, 100.0 * bottom_padding / frame_height, 0.0, 0.0]
    return [0.0, 0.0, 0.0, 0.0]

def  get_outpainting_frame_location(final_height, final_width,  outpainting_dims, block_size = 8, outpainting_ratio = "", source_height = None, source_width = None, quantize_margins = 0):
    if source_height is not None and source_width is not None:
        outpainting_dims = resolve_outpainting_dims(source_height, source_width, outpainting_dims, outpainting_ratio)
    outpainting_top, outpainting_bottom, outpainting_left, outpainting_right= outpainting_dims
    raw_height = int(final_height / ((100 + outpainting_top + outpainting_bottom) / 100))
    height = int(raw_height / block_size) * block_size
    extra_height = raw_height - height
          
    raw_width = int(final_width / ((100 + outpainting_left + outpainting_right) / 100)) 
    width = int(raw_width / block_size) * block_size
    extra_width = raw_width - width  
    margin_top = int(outpainting_top/(100 + outpainting_top + outpainting_bottom) * final_height)
    if extra_height != 0 and (outpainting_top + outpainting_bottom) != 0:
        margin_top += int(outpainting_top / (outpainting_top + outpainting_bottom) * extra_height)
    if (margin_top + height) > final_height or outpainting_bottom == 0: margin_top = final_height - height
    margin_left = int(outpainting_left/(100 + outpainting_left + outpainting_right) * final_width)
    if extra_width != 0 and (outpainting_left + outpainting_right) != 0:
        margin_left += int(outpainting_left / (outpainting_left + outpainting_right) * extra_width)
    if (margin_left + width) > final_width or outpainting_right == 0: margin_left = final_width - width
    if quantize_margins:
        height, margin_top = _quantize_outpainting_axis(margin_top, height, final_height, quantize_margins)
        width, margin_left = _quantize_outpainting_axis(margin_left, width, final_width, quantize_margins)
    return height, width, margin_top, margin_left

def slice_audio_window(audio_path, start_frame, num_frames, fps, output_dir=None, suffix="", pad_head=True, pad_tail=True):
    start_sec = float(start_frame) / float(fps)
    duration_sec = float(num_frames) / float(fps)

    with sf.SoundFile(audio_path) as audio_file:
        sample_rate = audio_file.samplerate
        channels = audio_file.channels
        total_frames = len(audio_file)
        start_sample = int(round(start_sec * sample_rate))
        pad_start = 0
        if start_sample < 0 and pad_head:
            pad_start = -start_sample
        if start_sample < 0:
            start_sample = 0
        frames_to_read = int(round(duration_sec * sample_rate))
        if start_sample > total_frames:
            data = np.zeros((0, channels), dtype=np.float32)
        else:
            audio_file.seek(min(start_sample, total_frames))
            data = audio_file.read(frames_to_read, dtype="float32", always_2d=True)

    if pad_head and pad_start > 0:
        data = np.concatenate([np.zeros((pad_start, channels), dtype=np.float32), data], axis=0)
    if pad_tail:
        target_frames = (pad_start if pad_head else 0) + frames_to_read
        if data.shape[0] < target_frames:
            pad_end = target_frames - data.shape[0]
            data = np.concatenate([data, np.zeros((pad_end, channels), dtype=np.float32)], axis=0)
    return data, sample_rate

def _quantize_outpainting_axis(before, inner, total, quantum):
    quantum = int(quantum or 0)
    if quantum <= 1:
        return inner, before
    after = total - before - inner
    before = max(0, int(round(before / quantum) * quantum))
    after = max(0, int(round(after / quantum) * quantum))
    min_inner = quantum if total >= quantum else 1
    overflow = before + after + min_inner - total
    if overflow > 0:
        if after >= before:
            after = max(0, after - int(math.ceil(overflow / quantum) * quantum))
        else:
            before = max(0, before - int(math.ceil(overflow / quantum) * quantum))
    inner = total - before - after
    return inner, before
