"""Native-window constraints are separate from the published output timeline."""


def trim_timeline(sample, audio, guide_end, *, requested, produced, fps, sample_rate, enabled, truncate_audio):
    if not enabled:
        return sample, audio, guide_end
    excess = max(0, int(sample.shape[1]) - max(0, requested - produced))
    if excess:
        sample = sample[:, :-excess]
        guide_end -= excess
        if audio is not None:
            audio = truncate_audio(audio, 0, excess, fps, sample_rate)
    return sample, audio, guide_end


def native_generation_kwargs(family, *, attention_sparsity, frames_to_inject, has_end,
                             window_length, requested, produced, reuse, window_no):
    if family != 'h3_advanced':
        return {}
    remaining = requested - produced + (reuse if window_no > 1 else 0)
    return {'attention_sparsity': attention_sparsity, 'frames_to_inject': frames_to_inject,
            'image_end_frame_position': min(window_length, remaining) - 1 if has_end else None}


def native_injection_frames(frames, from_window_start, guide_start, window_start):
    offset = 0 if from_window_start else guide_start - window_start
    positioned = [(index + offset, frame) for index, frame in enumerate(frames) if frame is not None]
    return [index for index, _ in positioned], [frame for _, frame in positioned]


def first_window_length(count, model_def, align):
    return align(count, model_def, for_generation=True) if model_def.get('wangp_1272') else count
