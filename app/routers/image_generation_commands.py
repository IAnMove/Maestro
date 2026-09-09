"""HTTP and MCP projections of the executable image command contract."""
from __future__ import annotations

from fastapi import APIRouter, Request
from services.image_generation_spec import image_generation_schema
from services.image_generation_commands import command_error


def image_command_catalog():
    spec = image_generation_schema()
    envelope = {"type": "object", "additionalProperties": False,
                "properties": {"version": {"type": "integer", "const": 1},
                               "operation": {"const": "generation.image"},
                               "intent_id": spec["intent_id"], "input": spec["input"]},
                "required": ["version", "operation", "intent_id", "input"]}
    receipt_input = {"type": "object", "additionalProperties": False,
                     "properties": {"workspace": spec["input"]["properties"]["workspace"],
                                    "intent_id": spec["intent_id"]}, "required": ["workspace", "intent_id"]}
    return [{"name": "generation.image", "version": 1, "domain": "studio", "mutation": True,
             "description": "Admit one text-to-image job using an installed image model and explicit output workspace. Preserve literal prompts. Reuse intent_id only for transport retries. Returns admission, not completed media. References and LoRAs are not supported by this operation yet.",
             "inputSchema": envelope},
            {"name": "generation.receipt", "version": 1, "domain": "studio", "mutation": False,
             "description": "Read an immutable image admission and its current canonical task in the exact original output workspace.",
             "inputSchema": {"type": "object", "additionalProperties": False,
                             "properties": {"version": {"type": "integer", "const": 1},
                                            "operation": {"const": "generation.receipt"}, "input": receipt_input},
                             "required": ["version", "operation", "input"]}}]


def image_command_handlers(service):
    async def submit(arguments):
        if not isinstance(arguments, dict) or set(arguments) != {"version", "intent_id", "input"}:
            raise command_error(422, "invalid_command", "Use version, intent_id and input for the image tool")
        return await service.submit({**arguments, "operation": "generation.image"}, trusted_tool="external_agent")

    def receipt(arguments):
        if (not isinstance(arguments, dict) or set(arguments) != {"version", "input"}
                or type(arguments.get("version")) is not int or arguments["version"] != 1
                or not isinstance(arguments["input"], dict)
                or set(arguments["input"]) != {"workspace", "intent_id"}):
            raise command_error(422, "invalid_command", "Use version 1 with workspace and intent_id")
        return service.receipt(**arguments["input"])

    return {"generation.image": submit, "generation.receipt": receipt}


def create_image_generation_commands_router(service):
    router = APIRouter()

    @router.get("/api/v1/generation/commands")
    def catalog():
        return {"version": 1, "operations": image_command_catalog()}

    @router.post("/api/v1/generation/commands")
    async def submit(request: Request):
        try:
            command = await request.json()
        except ValueError as error:
            raise command_error(422, "invalid_command", "Command must be valid JSON") from error
        return await service.submit(command)

    @router.get("/api/v1/generation/commands/receipt")
    def receipt(workspace: str, intent_id: str):
        return service.receipt(workspace, intent_id)

    return router
