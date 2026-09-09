"""Pure catalog projection for the typed Tools upscale operation."""

from __future__ import annotations

from copy import deepcopy

from services.tools_upscale_spec import tools_upscale_schema


def tools_upscale_command_catalog() -> dict:
    """Return the exact operation entry consumed by HTTP/MCP discovery."""
    schema = tools_upscale_schema()
    input_schema = dict(schema["input"])
    definitions = input_schema.pop("$defs", {})
    return {
        "name": "tools.upscale",
        "version": 2,
        "supportedVersions": [2],
        "domain": "tools",
        "mutation": True,
        "description": (
            "Upscale one exact image or video source in an explicit output "
            "workspace with an installed local processor. Preserve the "
            "source workspace, processor settings and intent_id; the shared "
            "receipt proves admission and its canonical task reports completion."
        ),
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "$defs": definitions,
            "properties": {
                "version": {"type": "integer", "const": 2},
                "operation": {"const": "tools.upscale"},
                "intent_id": deepcopy(schema["intent_id"]),
                "input": input_schema,
            },
            "required": ["version", "operation", "intent_id", "input"],
        },
    }


# Short aliases used by catalog exporters in adjacent command slices.
tools_upscale_catalog = tools_upscale_command_catalog
upscale_command_catalog = tools_upscale_command_catalog


__all__ = [
    "tools_upscale_catalog",
    "tools_upscale_command_catalog",
    "upscale_command_catalog",
]
