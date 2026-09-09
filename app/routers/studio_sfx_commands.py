"""Executable SFX command schema shared by local HTTP and external MCP."""
from services.studio_sfx_spec import studio_sfx_schema


def sfx_command_catalog():
    schema = studio_sfx_schema()
    input_schema = dict(schema["input"])
    definitions = input_schema.pop("$defs", {})
    return {
        "name": "generation.sfx", "version": 2, "supportedVersions": [2],
        "domain": "studio", "mutation": True,
        "description": "Generate sound effects with installed MMAudio files in an explicit output workspace. Preserve literal prompts. Text-only requests produce audio with a duration up to 20 seconds; video-guided requests use the inspected video duration and produce a video with new audio. Sources require canonical references. Reuse intent_id only to recover an existing admission; follow its task for completion.",
        "inputSchema": {
            "type": "object", "additionalProperties": False, "$defs": definitions,
            "properties": {"version": {"type": "integer", "const": 2},
                           "operation": {"const": "generation.sfx"},
                           "intent_id": schema["intent_id"], "input": input_schema},
            "required": ["version", "operation", "intent_id", "input"],
        },
    }
