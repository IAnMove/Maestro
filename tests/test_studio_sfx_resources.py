"""Canonical video guide resolution and identity tests for Studio SFX."""

from copy import deepcopy
import hashlib

import pytest

from services.asset_manifest import build_asset_manifest, write_asset_manifest
from services.studio_sfx_resources import StudioSfxResources


@pytest.fixture
def resources(tmp_path, monkeypatch):
    folders = {
        name: tmp_path / name
        for name in ("uploads", "source", "destination", "default")
    }
    for folder in folders.values():
        folder.mkdir()
    monkeypatch.setattr(
        "services.studio_sfx_resources.probe_media",
        lambda _path: {
            "duration": 31.25,
            "width": 640,
            "height": 360,
            "fps": 25.0,
            "has_audio": False,
            "pixel_format": "yuv420p",
            "has_alpha": False,
        },
    )
    resolver = StudioSfxResources(
        workspace_dir=lambda name: folders[name],
        uploads_dir=lambda: folders["uploads"],
        list_workspaces=lambda: [{"name": name} for name in ("source", "destination", "default")],
        lora_search_dirs=lambda _model: [],
        lora_compatible=lambda *_args: False,
    )
    return folders, resolver


def write_video(path, content=b"video-guide"):
    path.write_bytes(content)


def test_video_url_resolves_against_declared_source_and_returns_portable_identity(resources):
    folders, resolver = resources
    source = folders["source"] / "guide.mp4"
    destination = folders["destination"] / "guide.mp4"
    write_video(source, b"source-guide")
    write_video(destination, b"different-destination-guide")
    params = {
        "workspace": "destination",
        "video_guide": "/api/v1/file/guide.mp4?workspace=source",
    }
    before = deepcopy(params)
    working, identities = resolver.prepare_media(params)
    assert params == before
    assert working["video_guide"] == str(source)
    assert identities == [
        {
            "role": "video_guide",
            "index": 0,
            "url": "/api/v1/file/guide.mp4?workspace=source",
            "workspace": "source",
            "duration_seconds": 31.25,
            "width": 640,
            "height": 360,
            "fps": 25.0,
            "has_audio": False,
            "pixel_format": "yuv420p",
            "has_alpha": False,
            "sha256": hashlib.sha256(b"source-guide").hexdigest(),
            "size_bytes": len(b"source-guide"),
        }
    ]
    assert not any("path" in key for key in identities[0])


def test_text_only_request_has_no_resource_and_no_path(resources):
    folders, resolver = resources
    params = {"workspace": "destination", "video_guide": None}
    working, identities = resolver.prepare_media(params)
    assert working["video_guide"] is None
    assert identities == []


def test_missing_declared_source_does_not_fallback_to_destination(resources):
    folders, resolver = resources
    write_video(folders["destination"] / "guide.mp4")
    with pytest.raises(ValueError, match="not available|missing"):
        resolver.prepare_media({
            "workspace": "destination",
            "video_guide": "/api/v1/file/guide.mp4?workspace=source",
        })


def test_selected_non_video_is_rejected_after_canonical_resolution(resources, monkeypatch):
    folders, resolver = resources
    write_video(folders["source"] / "guide.mp4")
    monkeypatch.setattr(
        "services.studio_sfx_resources.probe_media",
        lambda _path: (_ for _ in ()).throw(ValueError("no video stream")),
    )
    with pytest.raises(ValueError, match="readable video"):
        resolver.prepare_media({
            "video_guide": "/api/v1/file/guide.mp4?workspace=source",
        })


def test_probe_requires_positive_finite_duration_and_dimensions(resources, monkeypatch):
    folders, resolver = resources
    write_video(folders["source"] / "guide.mp4")
    for metadata, message in (
        ({"duration": 0, "width": 640, "height": 360}, "duration"),
        ({"duration": float("nan"), "width": 640, "height": 360}, "duration"),
        ({"duration": 1, "width": 0, "height": 360}, "dimensions"),
    ):
        monkeypatch.setattr(
            "services.studio_sfx_resources.probe_media",
            lambda _path, metadata=metadata: metadata,
        )
        with pytest.raises(ValueError, match=message):
            resolver.prepare_media({"video_guide": "/api/v1/file/guide.mp4?workspace=source"})


def test_video_asset_id_requires_one_unique_location(resources):
    folders, resolver = resources
    source = folders["source"] / "guide.mp4"
    write_video(source)
    write_asset_manifest(source, build_asset_manifest(source, asset_id="asset_guide", kind="video"))
    working, identities = resolver.prepare_media({"video_guide": "asset_guide"})
    assert working["video_guide"] == str(source)
    assert identities[0]["url"] == "asset_guide"
    second = folders["destination"] / "guide.mp4"
    write_video(second, b"different")
    write_asset_manifest(second, build_asset_manifest(second, asset_id="asset_guide", kind="video"))
    with pytest.raises(ValueError, match="multiple locations"):
        resolver.prepare_media({"video_guide": "asset_guide"})


def test_upload_reference_cannot_override_source_workspace(resources):
    folders, resolver = resources
    write_video(folders["uploads"] / "guide.mp4")
    with pytest.raises(ValueError, match="override"):
        resolver.prepare_media({"video_guide": "/api/v1/uploads/guide.mp4?workspace=source"})
