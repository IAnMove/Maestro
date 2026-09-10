import copy
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.scene_commands import create_scene_commands_router
from routers.wangp_mcp import create_wangp_mcp_router
from services.scene_commands import SceneCommands, command_catalog


@pytest.fixture
def service(tmp_path):
    return SceneCommands(lambda workspace: tmp_path / workspace)


def showcase(service, dimension='3d'):
    return service.execute({'version': 1, 'operation': 'scenes.effects.showcase', 'input': {'dimension': dimension}})['result']['document']


def test_both_templates_use_all_catalog_effects_and_are_replayable(service):
    for dimension in ('2d', '3d'):
        doc = showcase(service, dimension)
        assert doc['duration'] == 90
        assert len(doc['sfx']) == 30
        assert all(cue['sound'] and cue['label'] for cue in doc['sfx'])
        assert doc == showcase(service, dimension)
        assert ('slots' in doc) == (dimension == '3d')


def test_apply_replaces_exact_cue_preserving_scene_and_caller(service):
    original = showcase(service)
    before = copy.deepcopy(original)
    cue = {**original['sfx'][3], 'color': '#123456'}
    command = {'version': 1, 'operation': 'scenes.effects.apply', 'input': {'document': original, 'cues': [cue]}}
    first = service.execute(command)
    assert original == before
    assert first == service.execute(command)
    actual = first['result']['document']
    assert len(actual['sfx']) == 30
    assert actual['sfx'][3] == cue
    assert actual['slots'] == original['slots']
    assert not first['result']['saved'] and not first['result']['exported']


@pytest.mark.parametrize('patch', [{'kind': 'invented'}, {'end': 0}, {'start': float('nan')}, {'seed': True}, {'sound': 'yes'}, {'volume': 2}])
def test_reject_invalid_effects_before_changing_document(service, patch):
    original = showcase(service)
    cue = {**original['sfx'][0], **patch}
    with pytest.raises(ValueError):
        service.execute({'version': 1, 'operation': 'scenes.effects.apply', 'input': {'document': original, 'cues': [cue]}})


def test_http_and_mcp_return_identical_documents_without_browser(service, tmp_path):
    app = FastAPI()
    app.include_router(create_scene_commands_router(service))
    app.include_router(create_wangp_mcp_router(handlers=service.handlers(), token_getter=lambda: 'test-token',
                                             journal_path=str(tmp_path / 'journal.db'), command_operations=command_catalog()))
    client = TestClient(app)
    command = {'version': 1, 'operation': 'scenes.effects.showcase', 'input': {'dimension': '2d'}}
    http = client.post('/api/v1/scenes/commands', json=command)
    assert http.status_code == 200
    mcp = client.post('/api/v1/wangp/mcp', headers={'Authorization': 'Bearer test-token'}, json={
        'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': command['operation'], 'arguments': {'version': 1, 'input': command['input']}}})
    assert mcp.status_code == 200
    assert not mcp.json()['result']['isError']
    assert mcp.json()['result']['structuredContent'] == http.json()
    schema = client.get('/api/v1/scenes/commands').json()
    assert len(schema['operations']) == 5


def test_world_cues_upsert_on_video3d_and_reject_2d(service):
    world = showcase(service, '3d')
    cue = {'id': 'portal-1', 'kind': 'portal', 'start': 0, 'end': 2, 'position': {'x': 0, 'y': 1, 'z': -1}, 'sound': True}
    first = service.execute({'version': 1, 'operation': 'scenes.effects.apply', 'input': {'document': world, 'worldCues': [cue]}})
    assert first['result']['document']['worldSfx'][0]['kind'] == 'portal'
    assert first['result']['document']['sfx'] == world['sfx']
    assert first == service.execute({'version': 1, 'operation': 'scenes.effects.apply', 'input': {'document': world, 'worldCues': [cue]}})
    catalog = service.execute({'version': 1, 'operation': 'scenes.effects.catalog', 'input': {}})['result']
    assert catalog['coordinates']['world'] == 'meters'
    assert 'portal' in catalog['worldKinds']
    assert 'energy_beam' in catalog['worldKinds']
    beam = {'id': 'beam-1', 'kind': 'energy_beam', 'start': 0, 'end': 2, 'anchor': {'slotId': 'subject_1'}, 'target': {'slotId': 'subject_2'}}
    beamed = service.execute({'version': 1, 'operation': 'scenes.effects.apply', 'input': {'document': world, 'worldCues': [beam]}})['result']['document']
    assert beamed['worldSfx'][0]['target']['slotId'] == 'subject_2'
    flat = showcase(service, '2d')
    with pytest.raises(ValueError, match='Video3D'):
        service.execute({'version': 1, 'operation': 'scenes.effects.apply', 'input': {'document': flat, 'worldCues': [cue]}})


def test_replace_one_sfx_track_preserves_the_other(service):
    world = showcase(service, '3d')
    portal = {'id': 'portal-1', 'kind': 'portal', 'start': 0, 'end': 2, 'position': {'x': 0, 'y': 1, 'z': -1},
              'rotation': {'x': 0, 'y': 90, 'z': 0}}
    with_portal = service.execute({'version': 1, 'operation': 'scenes.effects.apply',
                                   'input': {'document': world, 'worldCues': [portal]}})['result']['document']
    assert with_portal['worldSfx'][0]['rotation']['y'] == 90
    spark = {'id': 'spark-1', 'kind': 'sparks', 'start': 0, 'end': 2}
    screen_only = service.execute({'version': 1, 'operation': 'scenes.effects.apply',
                                   'input': {'document': with_portal, 'cues': [spark], 'replace': True}})['result']['document']
    assert [cue['id'] for cue in screen_only['sfx']] == ['spark-1']
    assert screen_only['worldSfx'][0]['kind'] == 'portal'
    assert screen_only['worldSfx'][0]['rotation']['y'] == 90
    circle = {'id': 'circle-1', 'kind': 'magic_circle', 'start': 0, 'end': 2}
    world_only = service.execute({'version': 1, 'operation': 'scenes.effects.apply',
                                  'input': {'document': screen_only, 'worldCues': [circle], 'replace': True}})['result']['document']
    assert [cue['id'] for cue in world_only['sfx']] == ['spark-1']
    assert [cue['id'] for cue in world_only['worldSfx']] == ['circle-1']


def test_catalog_lists_all_world_kinds(service):
    ops = {item['name']: item for item in command_catalog()}
    assert 'worldKinds' in ops['scenes.effects.catalog']['description']
    assert 'energy_beam' in ops['scenes.effects.catalog']['description']
    kinds = service.execute({'version': 1, 'operation': 'scenes.effects.catalog', 'input': {}})['result']['worldKinds']
    assert 'energy_beam' in kinds
    assert 'anime_aura' in kinds


def test_speech_rejects_paths_and_unknown_character_before_analysis(service):
    doc = showcase(service)
    doc['slots'][0]['sourceUrl'] = '/api/v1/file/actor.glb?workspace=default'
    data = {'document': doc, 'slot_id': 'subject_1', 'clip_id': 'hello', 'workspace': 'default',
            'audio_filename': '../../secret.wav', 'text': 'Hello, literally.', 'start': 0, 'end': 2}
    with pytest.raises(ValueError, match='filename'):
        service.execute({'version': 1, 'operation': 'scenes.speech.prepare', 'input': data})
    data['slot_id'] = 'missing'
    with pytest.raises(ValueError, match='exact 3D'):
        service.execute({'version': 1, 'operation': 'scenes.speech.prepare', 'input': data})


def test_shared_catalog_remains_a_packaged_resource():
    path = Path(__file__).parents[1] / 'app/shared/scene_effects.json'
    assert len(json.loads(path.read_text())) == 30


def test_speech_append_preserves_previous_voice_and_rejects_overlap():
    from services.scene_speech_command import with_speech_clip
    original = {'audio': {'filename': 'first.wav'}, 'cues': [], 'start': 0, 'end': 2, 'offset': 0, 'gain': 1}
    clip = {'id': 'second', 'start': 3, 'end': 5}
    updated = with_speech_clip(original, clip, 6)
    assert updated['clips'][0]['audio'] == original['audio']
    assert len(with_speech_clip(updated, clip, 6)['clips']) == 2
    with pytest.raises(ValueError, match='overlap'):
        with_speech_clip(original, {**clip, 'start': 1}, 6)
    assert 'clips' not in original


def test_anime_showcase_uses_36_seconds_and_preserves_longer_authored_scenes(service):
    command = {'version': 1, 'operation': 'scenes.effects.showcase', 'input': {'collection': 'anime'}}
    scene = service.execute(command)['result']['document']
    assert scene['duration'] == 36 and len(scene['sfx']) == 12
    scene['duration'] = 72
    command['input']['document'] = scene
    assert service.execute(command)['result']['document']['duration'] == 72


@pytest.mark.parametrize('collection,seconds', [('anime', 36), ('all', 90)])
def test_default_2d_showcase_has_no_longer_background_tail(service, collection, seconds):
    scene = service.execute({'version': 1, 'operation': 'scenes.effects.showcase',
                             'input': {'dimension': '2d', 'collection': collection}})['result']['document']
    assert scene['duration'] == seconds
    assert scene['layers'][0]['animation']['duration'] == seconds
    scene['layers'][0]['animation']['duration'] = 120
    preserved = service.execute({'version': 1, 'operation': 'scenes.effects.showcase',
                                 'input': {'document': scene, 'collection': collection}})['result']['document']
    assert preserved['layers'] == scene['layers']
