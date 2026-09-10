#!/usr/bin/env python3
"""Write a tiny TV-head humanoid GLB (boxes + bones, Walk/Idle/restpose)."""
from __future__ import annotations

import json
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLB_PATH = ROOT / "ui/public/examples/tv-head-humanoid.glb"
FACE_PATH = ROOT / "ui/public/examples/tv-head-face.png"


def quat_x(angle: float) -> list[float]:
    h = angle * 0.5
    return [math.sin(h), 0.0, 0.0, math.cos(h)]


def quat_z(angle: float) -> list[float]:
    h = angle * 0.5
    return [0.0, 0.0, math.sin(h), math.cos(h)]


def quat_y(angle: float) -> list[float]:
    h = angle * 0.5
    return [0.0, math.sin(h), 0.0, math.cos(h)]


def box_geometry() -> tuple[bytes, bytes, bytes]:
    faces = [
        ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
        ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)]),
        ((0, 1, 0), [(-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1)]),
        ((0, -1, 0), [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)]),
        ((1, 0, 0), [(1, -1, 1), (1, -1, -1), (1, 1, -1), (1, 1, 1)]),
        ((-1, 0, 0), [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)]),
    ]
    positions: list[float] = []
    normals: list[float] = []
    indices: list[int] = []
    for normal, corners in faces:
        base = len(positions) // 3
        for corner in corners:
            positions.extend(v * 0.5 for v in corner)
            normals.extend(normal)
        indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return (
        struct.pack(f"<{len(positions)}f", *positions),
        struct.pack(f"<{len(normals)}f", *normals),
        struct.pack(f"<{len(indices)}H", *indices),
    )


def pad4(data: bytes, padding: bytes = b"\x00") -> bytes:
    return data + padding * ((4 - (len(data) % 4)) % 4)


def write_png(path: Path, width: int, height: int, pixels: bytes) -> None:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + pixels[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def tv_face_png(path: Path) -> None:
    width = height = 64
    pixels = bytearray()
    for y in range(height):
        for x in range(width):
            edge = x < 3 or y < 3 or x > 60 or y > 60
            eye = ((x - 22) ** 2 + (y - 24) ** 2 < 18) or ((x - 42) ** 2 + (y - 24) ** 2 < 18)
            smile = 18 < y < 48 and 16 < x < 48 and abs((x - 32) ** 2 / 220 + (y - 40) - 4) < 1.8 and y > 36
            if edge:
                pixels.extend((28, 34, 48, 255))
            elif eye:
                pixels.extend((18, 22, 30, 255))
            elif smile:
                pixels.extend((18, 22, 30, 255))
            else:
                pixels.extend((96, 210, 196, 255))
    write_png(path, width, height, bytes(pixels))


def build() -> None:
    pos, nrm, idx = box_geometry()
    times = [0.0, 0.3, 0.6, 0.9, 1.2]
    walk_l = [quat_x(a) for a in (0.5, 0.0, -0.5, 0.0, 0.5)]
    walk_r = [quat_x(a) for a in (-0.5, 0.0, 0.5, 0.0, -0.5)]
    arm_l = [quat_x(a) for a in (-0.35, 0.0, 0.35, 0.0, -0.35)]
    arm_r = [quat_x(a) for a in (0.35, 0.0, -0.35, 0.0, 0.35)]
    idle_t = [0.0, 1.0, 2.0]
    idle_head = [quat_y(-0.08), quat_y(0.08), quat_y(-0.08)]
    rest_t = [0.0, 0.1]
    ident = [0.0, 0.0, 0.0, 1.0]

    def pack_f(values: list[float]) -> bytes:
        return struct.pack(f"<{len(values)}f", *values)

    def flatten(rows: list[list[float]]) -> list[float]:
        out: list[float] = []
        for row in rows:
            out.extend(row)
        return out

    blobs = [
        pos, nrm, idx,
        pack_f(times), pack_f(flatten(walk_l)), pack_f(flatten(walk_r)),
        pack_f(flatten(arm_l)), pack_f(flatten(arm_r)),
        pack_f(idle_t), pack_f(flatten(idle_head)),
        pack_f(rest_t), pack_f(ident + ident),
    ]
    array_targets = {0: 34962, 1: 34962, 2: 34963}
    views = []
    cursor = 0
    aligned: list[bytes] = []
    for index, blob in enumerate(blobs):
        padded = pad4(blob)
        view: dict = {"buffer": 0, "byteOffset": cursor, "byteLength": len(blob)}
        if index in array_targets:
            view["target"] = array_targets[index]
        views.append(view)
        aligned.append(padded)
        cursor += len(padded)
    bin_blob = b"".join(aligned)

    def acc(view: int, count: int, ctype: str, component: int, mn: list[float] | None = None, mx: list[float] | None = None) -> dict:
        item = {"bufferView": view, "componentType": component, "count": count, "type": ctype}
        if mn is not None:
            item["min"] = mn
        if mx is not None:
            item["max"] = mx
        return item

    accessors = [
        acc(0, 24, "VEC3", 5126, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
        acc(1, 24, "VEC3", 5126, [-1, -1, -1], [1, 1, 1]),
        acc(2, 36, "SCALAR", 5123),
        acc(3, 5, "SCALAR", 5126, [0], [1.2]),
        acc(4, 5, "VEC4", 5126),
        acc(5, 5, "VEC4", 5126),
        acc(6, 5, "VEC4", 5126),
        acc(7, 5, "VEC4", 5126),
        acc(8, 3, "SCALAR", 5126, [0], [2]),
        acc(9, 3, "VEC4", 5126),
        acc(10, 2, "SCALAR", 5126, [0], [0.1]),
        acc(11, 2, "VEC4", 5126),
    ]

    # Bone nodes first, then mesh-offset children. Indices must stay stable for animation targets.
    nodes: list[dict] = []

    def add_node(**kwargs) -> int:
        nodes.append(kwargs)
        return len(nodes) - 1

    hips = add_node(name="Hips", translation=[0, 0.92, 0], children=[])
    spine = add_node(name="Spine", translation=[0, 0.12, 0], children=[])
    chest = add_node(name="Chest", translation=[0, 0.18, 0], children=[])
    head = add_node(name="Head", translation=[0, 0.22, 0], children=[])
    headfront = add_node(name="headfront", translation=[0.0, 0.09, 0.18])
    head_end = add_node(name="head_end", translation=[0.0, 0.16, 0.0])
    l_sh = add_node(name="LeftShoulder", translation=[0.18, 0.12, 0], rotation=quat_z(-1.15), children=[])
    l_arm = add_node(name="LeftArm", translation=[0.0, 0.16, 0], children=[])
    l_fore = add_node(name="LeftForeArm", translation=[0.0, 0.26, 0], children=[])
    l_hand = add_node(name="LeftHand", translation=[0.0, 0.22, 0])
    r_sh = add_node(name="RightShoulder", translation=[-0.18, 0.12, 0], rotation=quat_z(1.15), children=[])
    r_arm = add_node(name="RightArm", translation=[0.0, 0.16, 0], children=[])
    r_fore = add_node(name="RightForeArm", translation=[0.0, 0.26, 0], children=[])
    r_hand = add_node(name="RightHand", translation=[0.0, 0.22, 0])
    l_up = add_node(name="LeftUpLeg", translation=[0.11, -0.04, 0], children=[])
    l_leg = add_node(name="LeftLeg", translation=[0.0, -0.36, 0], children=[])
    l_foot = add_node(name="LeftFoot", translation=[0.0, -0.34, 0.06], rotation=quat_x(0.2))
    r_up = add_node(name="RightUpLeg", translation=[-0.11, -0.04, 0], children=[])
    r_leg = add_node(name="RightLeg", translation=[0.0, -0.36, 0], children=[])
    r_foot = add_node(name="RightFoot", translation=[0.0, -0.34, 0.06], rotation=quat_x(0.2))

    def box_child(parent: int, name: str, translation: list[float], scale: list[float], mesh: int = 0, rotation: list[float] | None = None) -> int:
        payload: dict = {"name": name, "mesh": mesh, "translation": translation, "scale": scale}
        if rotation:
            payload["rotation"] = rotation
        index = add_node(**payload)
        nodes[parent].setdefault("children", []).append(index)
        return index

    nodes[hips]["children"] = [spine, l_up, r_up]
    nodes[spine]["children"] = [chest]
    nodes[chest]["children"] = [head, l_sh, r_sh]
    nodes[head]["children"] = [headfront, head_end]
    nodes[l_sh]["children"] = [l_arm]
    nodes[l_arm]["children"] = [l_fore]
    nodes[l_fore]["children"] = [l_hand]
    nodes[r_sh]["children"] = [r_arm]
    nodes[r_arm]["children"] = [r_fore]
    nodes[r_fore]["children"] = [r_hand]
    nodes[l_up]["children"] = [l_leg]
    nodes[l_leg]["children"] = [l_foot]
    nodes[r_up]["children"] = [r_leg]
    nodes[r_leg]["children"] = [r_foot]
    # Mesh parts are appended after the skeleton links so Walk/Idle still target the bones.

    body, crt, glass, metal = 0, 1, 2, 3
    box_child(hips, "hips_mesh", [0, 0.02, 0], [0.28, 0.14, 0.16], body)
    box_child(spine, "spine_mesh", [0, 0.08, 0], [0.24, 0.16, 0.14], body)
    box_child(chest, "chest_mesh", [0, 0.08, 0], [0.32, 0.22, 0.16], body)
    box_child(chest, "neck_mesh", [0, 0.20, 0], [0.09, 0.08, 0.09], crt)
    # Old CRT cabinet: deep beige tube, thick bezel, dark glass, knobs, rabbit ears.
    box_child(head, "tv_cabinet", [0, 0.06, -0.04], [0.44, 0.38, 0.32], crt)
    box_child(head, "tv_bezel", [0, 0.08, 0.13], [0.40, 0.30, 0.06], crt)
    box_child(head, "tv_glass", [0, 0.09, 0.165], [0.30, 0.22, 0.02], glass)
    box_child(head, "tv_controls", [0, -0.12, 0.12], [0.38, 0.07, 0.10], crt)
    box_child(head, "tv_knob_l", [-0.12, -0.12, 0.18], [0.045, 0.045, 0.04], metal)
    box_child(head, "tv_knob_r", [-0.05, -0.12, 0.18], [0.045, 0.045, 0.04], metal)
    box_child(head, "tv_antenna_l", [-0.08, 0.32, -0.02], [0.012, 0.28, 0.012], metal, quat_z(0.35))
    box_child(head, "tv_antenna_r", [0.08, 0.32, -0.02], [0.012, 0.28, 0.012], metal, quat_z(-0.35))
    box_child(l_arm, "l_arm_mesh", [0, 0.13, 0], [0.08, 0.26, 0.08], body)
    box_child(l_fore, "l_fore_mesh", [0, 0.12, 0], [0.07, 0.24, 0.07], body)
    box_child(l_hand, "l_hand_mesh", [0, 0.04, 0], [0.08, 0.10, 0.08], body)
    box_child(r_arm, "r_arm_mesh", [0, 0.13, 0], [0.08, 0.26, 0.08], body)
    box_child(r_fore, "r_fore_mesh", [0, 0.12, 0], [0.07, 0.24, 0.07], body)
    box_child(r_hand, "r_hand_mesh", [0, 0.04, 0], [0.08, 0.10, 0.08], body)
    box_child(l_up, "l_up_mesh", [0, -0.18, 0], [0.11, 0.36, 0.11], body)
    box_child(l_leg, "l_leg_mesh", [0, -0.16, 0], [0.09, 0.32, 0.09], body)
    box_child(l_foot, "l_foot_mesh", [0, -0.04, 0.06], [0.10, 0.08, 0.22], body)
    box_child(r_up, "r_up_mesh", [0, -0.18, 0], [0.11, 0.36, 0.11], body)
    box_child(r_leg, "r_leg_mesh", [0, -0.16, 0], [0.09, 0.32, 0.09], body)
    box_child(r_foot, "r_foot_mesh", [0, -0.04, 0.06], [0.10, 0.08, 0.22], body)

    armature = add_node(name="Armature", children=[hips])
    gltf = {
        "asset": {"version": "2.0", "generator": "hocuspocus-tv-head-humanoid"},
        "scene": 0,
        "scenes": [{"nodes": [armature], "name": "TVHeadHumanoid"}],
        "nodes": nodes,
        "materials": [
            {"name": "body", "pbrMetallicRoughness": {"baseColorFactor": [0.20, 0.26, 0.34, 1], "metallicFactor": 0.05, "roughnessFactor": 0.85}},
            {"name": "crt", "pbrMetallicRoughness": {"baseColorFactor": [0.78, 0.73, 0.58, 1], "metallicFactor": 0.0, "roughnessFactor": 0.7}},
            {"name": "glass", "pbrMetallicRoughness": {"baseColorFactor": [0.07, 0.09, 0.11, 1], "metallicFactor": 0.2, "roughnessFactor": 0.35}},
            {"name": "metal", "pbrMetallicRoughness": {"baseColorFactor": [0.45, 0.46, 0.48, 1], "metallicFactor": 0.6, "roughnessFactor": 0.4}},
        ],
        "meshes": [
            {"name": "BoxBody", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]},
            {"name": "BoxCrt", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 1}]},
            {"name": "BoxGlass", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 2}]},
            {"name": "BoxMetal", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 3}]},
        ],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(bin_blob)}],
        "animations": [
            {
                "name": "Walking",
                "samplers": [
                    {"input": 3, "output": 4, "interpolation": "LINEAR"},
                    {"input": 3, "output": 5, "interpolation": "LINEAR"},
                    {"input": 3, "output": 6, "interpolation": "LINEAR"},
                    {"input": 3, "output": 7, "interpolation": "LINEAR"},
                ],
                "channels": [
                    {"sampler": 0, "target": {"node": l_up, "path": "rotation"}},
                    {"sampler": 1, "target": {"node": r_up, "path": "rotation"}},
                    {"sampler": 2, "target": {"node": l_arm, "path": "rotation"}},
                    {"sampler": 3, "target": {"node": r_arm, "path": "rotation"}},
                ],
            },
            {
                "name": "Idle",
                "samplers": [{"input": 8, "output": 9, "interpolation": "LINEAR"}],
                "channels": [{"sampler": 0, "target": {"node": head, "path": "rotation"}}],
            },
            {
                "name": "restpose",
                "samplers": [{"input": 10, "output": 11, "interpolation": "STEP"}],
                "channels": [{"sampler": 0, "target": {"node": hips, "path": "rotation"}}],
            },
        ],
    }
    json_blob = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    glb = b"".join([
        struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_blob) + 8 + len(bin_blob)),
        struct.pack("<I4s", len(json_blob), b"JSON"),
        json_blob,
        struct.pack("<I4s", len(bin_blob), b"BIN\x00"),
        bin_blob,
    ])
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.write_bytes(glb)
    tv_face_png(FACE_PATH)
    print(f"wrote {GLB_PATH} ({GLB_PATH.stat().st_size} bytes)")
    print(f"wrote {FACE_PATH} ({FACE_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
