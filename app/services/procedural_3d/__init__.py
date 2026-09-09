"""CPU-only procedural 3D helpers.

This package must not import WanGP, torch, trimesh, pygltflib, or the launch
runtime. The GLB inspector is an internal path API, not an HTTP endpoint.
"""

from services.procedural_3d.glb_inspector import (
    AnimationChannelReport,
    AnimationClipReport,
    BufferReport,
    DurationStatus,
    GlbInspectionReport,
    GlbInspectorLimits,
    InspectionStatus,
    InspectorIssue,
    MeshReport,
    NamedResource,
    SCHEMA_VERSION,
    SkinReport,
    inspect_glb,
    inspect_glb_bytes,
    report_to_dict,
)

__all__ = [
    "SCHEMA_VERSION",
    "AnimationChannelReport",
    "AnimationClipReport",
    "BufferReport",
    "DurationStatus",
    "GlbInspectionReport",
    "GlbInspectorLimits",
    "InspectionStatus",
    "InspectorIssue",
    "MeshReport",
    "NamedResource",
    "SkinReport",
    "inspect_glb",
    "inspect_glb_bytes",
    "report_to_dict",
]
