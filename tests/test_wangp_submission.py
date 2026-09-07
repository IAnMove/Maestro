"""Viggle's admission, provenance and audio behavior without model weights."""
import json
import subprocess
from pathlib import Path

import pytest
from PIL import Image
from services.wangp_submission import prepare_viggle_recast, preserve_source_audio, resolve_wangp_media, viggle_parameters


def test_viggle_maps_one_edited_frame_and_keeps_source_identity():
    params = viggle_parameters({'prompt': 'Not used', 'num_inference_steps': 99, 'seed': 41}, video='/v.mp4', reference='/edited.png', width=1920, height=1080, duration=9.625)
    assert params['video_length'] == 231
    assert params['num_inference_steps'] == 3
    assert params['image_refs'] == ['/edited.png']
    assert params['video_guide'] == params['viggle_source_video'] == '/v.mp4'
    assert params['seed'] == 41
    assert params['prompt_enhancer'] == ''
    assert (params['sample_solver'], params['flow_shift'], params['guidance_scale']) == ('euler', 3, 1)
    assert (params['sliding_window_size'], params['sliding_window_overlap']) == (124, 18)


@pytest.mark.parametrize('duration', [0, -1, float('nan'), float('inf')])
def test_invalid_video_duration_never_enters_queue(duration):
    with pytest.raises(ValueError):
        viggle_parameters({}, video='v', reference='i', width=32, height=32, duration=duration)


def test_explicit_asset_roots_do_not_alias_same_named_files(tmp_path):
    uploads, workspace = tmp_path / 'uploads', tmp_path / 'outputs'
    uploads.mkdir(); workspace.mkdir()
    (uploads / 'same.png').write_bytes(b'upload')
    (workspace / 'same.png').write_bytes(b'output')
    def resolve(value):
        return resolve_wangp_media(value, 'demo', uploads_dir=uploads, workspace_dir=workspace)
    assert Path(resolve('/api/v1/uploads/same.png')).read_bytes() == b'upload'
    assert Path(resolve('/api/v1/file/same.png?workspace=demo')).read_bytes() == b'output'
    for value in ('same.png', '/api/v1/file/same.png?workspace=other', '/api/v1/uploads/../outside.png', 'https://example.com/same.png'):
        with pytest.raises(ValueError):
            resolve(value)


def make_video(path, audio=False):
    command = ['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=24:d=0.5']
    if audio:
        command += ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5']
    subprocess.run(command + ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(path)], check=True, capture_output=True)


def audio_streams(path):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_streams', '-of', 'json', str(path)]))['streams']


@pytest.mark.parametrize('source_audio', [True, False])
def test_source_audio_mode_preserves_silence_instead_of_model_sound(tmp_path, source_audio):
    source, output = tmp_path / 'source.mp4', tmp_path / 'result.mp4'
    make_video(source, audio=source_audio)
    make_video(output, audio=True)
    preserve_source_audio(output, source)
    assert bool(audio_streams(output)) is source_audio
    assert not list(tmp_path.glob('.*mux*'))


def test_preparation_rejects_an_unrelated_aspect_ratio(tmp_path):
    source, reference = tmp_path / 'source.mp4', tmp_path / 'edited.png'
    make_video(source)
    Image.new('RGB', (128, 64)).save(reference)
    with pytest.raises(ValueError, match='aspect ratio'):
        prepare_viggle_recast({'video_path': str(source), 'ref_image_path': str(reference)}, lambda value, _: value, tmp_path / 'uploads')


def test_recast_sidecar_preserves_canonical_asset_roots(tmp_path):
    from services.wangp_submission import wangp_media_url
    uploads, workspace = tmp_path / 'uploads', tmp_path / 'outputs'
    uploads.mkdir(); workspace.mkdir()
    source, reference = uploads / 'source.mp4', workspace / 'edited frame.png'
    make_video(source)
    Image.new('RGB', (64, 64)).save(reference)
    url = lambda path: wangp_media_url(path, 'demo workspace', uploads_dir=uploads, workspace_dir=workspace)
    params = prepare_viggle_recast({'video_path': str(source), 'ref_image_path': str(reference)}, lambda value, _: value, uploads, url)
    assert params['edit_video_url'] == '/api/v1/uploads/source.mp4'
    assert params['edit_recast_ref_url'] == '/api/v1/file/edited%20frame.png?workspace=demo+workspace'
    assert resolve_wangp_media(params['edit_recast_ref_url'], 'demo workspace', uploads_dir=uploads, workspace_dir=workspace) == str(reference)
