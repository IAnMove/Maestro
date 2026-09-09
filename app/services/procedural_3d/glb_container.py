"""Bounded GLB container reader (header + chunks). No URI resolution."""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
HEADER_BYTES = 12
CHUNK_HEADER_BYTES = 8
SUPPORTED_GLB_VERSION = 2


class ContainerError(Exception):
    """Malformed GLB container; message is an issue code."""


@dataclass(frozen=True)
class GlbChunk:
    chunk_type: int
    data: bytes


@dataclass
class GlbContainer:
    version: int
    declared_length: int
    actual_length: int
    chunks: list[GlbChunk] = field(default_factory=list)
    json_bytes: bytes | None = None
    bin_bytes: bytes | None = None
    issues: list[tuple[str, str]] = field(default_factory=list)


def _u32(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise ContainerError("truncated_header")
    return struct.unpack_from("<I", data, offset)[0]


def parse_glb_container(
    data: bytes,
    *,
    max_chunks: int,
    max_json_bytes: int,
) -> GlbContainer:
    """Parse the GLB container. Does not interpret glTF JSON."""
    actual = len(data)
    if actual < HEADER_BYTES:
        raise ContainerError("truncated_header")
    magic = _u32(data, 0)
    if magic != GLB_MAGIC:
        raise ContainerError("invalid_magic")
    version = _u32(data, 4)
    declared = _u32(data, 8)
    container = GlbContainer(
        version=version,
        declared_length=declared,
        actual_length=actual,
    )
    if version != SUPPORTED_GLB_VERSION:
        container.issues.append(
            ("unsupported_glb_version", f"GLB container version {version} is not 2")
        )
    if declared > actual:
        raise ContainerError("truncated_file")
    if declared < HEADER_BYTES:
        raise ContainerError("invalid_declared_length")
    if actual > declared:
        container.issues.append(
            ("trailing_bytes", "file is longer than the GLB header length")
        )
    _read_chunks(container, data[:declared], max_chunks=max_chunks, max_json_bytes=max_json_bytes)
    if container.json_bytes is None:
        raise ContainerError("missing_json_chunk")
    if container.chunks[0].chunk_type != JSON_CHUNK:
        raise ContainerError("json_chunk_not_first")
    return container


def _read_chunks(
    container: GlbContainer,
    working: bytes,
    *,
    max_chunks: int,
    max_json_bytes: int,
) -> None:
    offset = HEADER_BYTES
    json_chunks = 0
    bin_chunks = 0
    while offset < len(working):
        if len(container.chunks) >= max_chunks:
            raise ContainerError("too_many_chunks")
        payload, chunk_type, offset = _next_chunk(working, offset)
        container.chunks.append(GlbChunk(chunk_type=chunk_type, data=payload))
        if chunk_type == JSON_CHUNK:
            json_chunks += 1
            _accept_json_chunk(container, payload, json_chunks, max_json_bytes)
        elif chunk_type == BIN_CHUNK:
            bin_chunks += 1
            if bin_chunks > 1:
                raise ContainerError("duplicate_bin_chunk")
            container.bin_bytes = payload
        else:
            container.issues.append(
                (
                    "unknown_chunk_type",
                    f"ignored GLB chunk type 0x{chunk_type:08x}",
                )
            )


def _next_chunk(working: bytes, offset: int) -> tuple[bytes, int, int]:
    if offset + CHUNK_HEADER_BYTES > len(working):
        raise ContainerError("truncated_chunk_header")
    chunk_length = _u32(working, offset)
    chunk_type = _u32(working, offset + 4)
    data_start = offset + CHUNK_HEADER_BYTES
    if chunk_length < 0:
        raise ContainerError("invalid_chunk_length")
    if data_start + chunk_length > len(working):
        raise ContainerError("truncated_chunk")
    if chunk_length % 4 != 0:
        raise ContainerError("unaligned_chunk_length")
    next_offset = data_start + chunk_length
    if next_offset < data_start:
        raise ContainerError("chunk_offset_overflow")
    return working[data_start:next_offset], chunk_type, next_offset


def _accept_json_chunk(
    container: GlbContainer,
    payload: bytes,
    json_chunks: int,
    max_json_bytes: int,
) -> None:
    if json_chunks > 1:
        raise ContainerError("duplicate_json_chunk")
    if container.chunks[0].chunk_type != JSON_CHUNK:
        raise ContainerError("json_chunk_not_first")
    if len(payload) > max_json_bytes:
        raise ContainerError("json_too_large")
    container.json_bytes = payload
