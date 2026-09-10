"""Audio conditioning for a postprocessor follows its exact source window."""
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def decoded_source_audio(path):
    if not path or Path(path).suffix.lower() == '.wav':
        yield path
        return
    from shared.utils.audio_video import extract_audio_tracks, cleanup_temp_audio_files
    tracks, _ = extract_audio_tracks(path, temp_format='wav')
    try:
        yield tracks[0] if tracks else None
    finally:
        cleanup_temp_audio_files(tracks)


def generation_audio_context(*, prompt, generated_audio, sample_rate, source_path,
                             native_offset, fps, output_fps, model_type,
                             viggle_audio_mode, viggle_source_video):
    if model_type == 'viggle_animate' and viggle_audio_mode == 'source':
        generated_audio, source_path = None, viggle_source_video
    if generated_audio is not None:
        return dict(prompt=prompt, audio_waveform=generated_audio, audio_sample_rate=sample_rate, frame_offset=0)
    return dict(prompt=prompt, source_audio_path=source_path,
                frame_offset=round(native_offset * output_fps / fps))
