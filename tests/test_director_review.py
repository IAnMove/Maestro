import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers.director_review import create_director_review_router
from services import director_pipeline as pipeline
from services.director_review import save_review


def fixture(tmp_path):
    state = {"pipeline_id": "review-test", "status": "completed", "clips": [
        {"index": 0, "video_filename": "new.mp4", "video_attempts": [
            {"id": "old-id", "filename": "old.mp4"}, {"id": "new-id", "filename": "new.mp4"}],
         "video_prompt": "literal prompt", "tag": None},
        {"index": 1, "video_filename": "approved.mp4", "tag": "good"},
    ]}
    path = tmp_path / f"{pipeline._PIPELINE_FILE_PREFIX}review-test.json"
    path.write_text(json.dumps(state))
    for name in ("old.mp4", "new.mp4", "approved.mp4"):
        (tmp_path / name).write_bytes(b"media placeholder for persistence-only test")
    return path, state


def test_review_persists_exact_take_tag_and_notes_and_preserves_other_shots(tmp_path):
    path, state = fixture(tmp_path)
    app = FastAPI()
    app.include_router(create_director_review_router(lambda name: str(tmp_path)))
    response = TestClient(app).put('/api/v1/director/pipelines/review-test/review', json={
        'workspace': 'test', 'commands': [
            {'type': 'select_take', 'pipelineId': 'review-test', 'clipIndex': 0, 'filename': 'old.mp4', 'takeId': 'old-id'},
            {'type': 'tag_clip', 'pipelineId': 'review-test', 'clipIndex': 0, 'tag': 'good'},
            {'type': 'note_clip', 'pipelineId': 'review-test', 'clipIndex': 0, 'notes': '  literal\nnotes  '},
        ],
    })
    assert response.status_code == 200, response.text
    saved = json.loads(path.read_text())
    assert saved['clips'][0]['selected_video_filename'] == 'old.mp4'
    assert saved['clips'][0]['review_notes'] == '  literal\nnotes  '
    assert saved['clips'][0]['video_attempts'] == state['clips'][0]['video_attempts']
    assert saved['clips'][1] == state['clips'][1]


def test_review_rejects_invalid_batch_without_partial_save(tmp_path):
    path, _ = fixture(tmp_path)
    before = path.read_bytes()
    with pytest.raises(ValueError):
        save_review(str(tmp_path), 'review-test', [
            {'type': 'note_clip', 'pipelineId': 'review-test', 'clipIndex': 0, 'notes': 'should roll back'},
            {'type': 'select_take', 'pipelineId': 'review-test', 'clipIndex': 0, 'filename': '../elsewhere.mp4'},
        ])
    assert path.read_bytes() == before


def test_review_obeys_pipeline_busy_guard(tmp_path):
    fixture(tmp_path)
    pipeline._pipeline_operations.add('review-test')
    try:
        with pytest.raises(pipeline.PipelineBusyError):
            save_review(str(tmp_path), 'review-test', [])
    finally:
        pipeline._pipeline_operations.discard('review-test')


def test_switching_an_approved_take_updates_h3_selection_without_approving_it(tmp_path):
    path, state = fixture(tmp_path)
    state['clips'][0].update(tag='good', h3_segments=[{'filename': 'new.mp4', 'stale': True}])
    path.write_text(json.dumps(state))
    save_review(str(tmp_path), 'review-test', [
        {'type': 'select_take', 'pipelineId': 'review-test', 'clipIndex': 0, 'filename': 'old.mp4'},
    ])
    saved = json.loads(path.read_text())
    assert saved['clips'][0]['tag'] is None
    assert saved['clips'][0]['h3_segments'][0]['filename'] == 'old.mp4'
    assert saved['clips'][0]['h3_segments'][0]['stale'] is False
    assert 'old.mp4' in saved['output_files']
