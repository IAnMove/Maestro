"""CPU-free contracts for Video Editor soundtrack probing and mixing."""

from types import SimpleNamespace

import pytest

from app.services import video_editor


def test_probe_audio_accepts_audio_only_media(monkeypatch):
    monkeypatch.setattr(video_editor.subprocess, "run", lambda *_args, **_kwargs: SimpleNamespace(
        returncode=0,
        stdout='{"format":{"duration":"12.5"},"streams":[{"codec_type":"audio"}]}',
        stderr="",
    ))

    assert video_editor.probe_audio("score.mp3") == {"duration": 12.5, "has_audio": True}


def test_probe_audio_rejects_media_without_audio(monkeypatch):
    monkeypatch.setattr(video_editor.subprocess, "run", lambda *_args, **_kwargs: SimpleNamespace(
        returncode=0,
        stdout='{"format":{"duration":"4"},"streams":[{"codec_type":"video"}]}',
        stderr="",
    ))

    with pytest.raises(ValueError, match="audio stream"):
        video_editor.probe_audio("silent.mp4")


def test_looped_soundtrack_is_mixed_for_the_full_video_duration(monkeypatch):
    calls = []
    monkeypatch.setattr(video_editor, "_run", lambda command, **kwargs: calls.append((command, kwargs)))

    video_editor._mix_soundtrack(
        "assembled.mp4",
        "final.mp4",
        {
            "resolved_path": "score.mp3",
            "trim_start": 1,
            "trim_end": 4,
            "volume": 0.5,
            "loop": True,
        },
        10,
    )

    command, kwargs = calls[0]
    assert command[command.index("-stream_loop") + 1] == "-1"
    graph = command[command.index("-filter_complex") + 1]
    assert "[0:a:0]apad,atrim=duration=10.0000000000" in graph
    assert "atrim=duration=10.0000000000" in graph
    assert "volume=0.5000" in graph
    assert command[command.index("-muxpreload") + 1] == "0"
    assert command[command.index("-muxdelay") + 1] == "0"
    assert kwargs["label"] == "Mixing editor soundtrack"


def test_short_soundtrack_mix_pads_to_the_video_span(monkeypatch):
    calls = []
    monkeypatch.setattr(video_editor, "_run", lambda command, **kwargs: calls.append((command, kwargs)))

    video_editor._mix_soundtrack(
        "assembled.mp4",
        "final.mp4",
        {
            "resolved_path": "score.mp3",
            "trim_start": 0,
            "trim_end": 2,
            "volume": 0.5,
            "loop": False,
        },
        0.4,
        frames=12,
        fps=30,
    )

    command, _kwargs = calls[0]
    graph = command[command.index("-filter_complex") + 1]
    assert graph.startswith("[0:a:0]apad,atrim=duration=0.4000000000")
    assert "[base][music]amix=inputs=2:duration=first:dropout_transition=0,apad,atrim=duration=0.4000000000" in graph
