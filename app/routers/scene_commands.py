from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from services.scene_commands import command_catalog, command_error
from services.scene3d_speech import SpeechAnalysisError, SpeechAnalysisUnavailable


def create_scene_commands_router(service):
    router = APIRouter()

    @router.get('/api/v1/scenes/commands')
    def catalog():
        return {'version': 1, 'operations': command_catalog()}

    @router.post('/api/v1/scenes/commands')
    async def execute(request: Request):
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > 3 * 1024 * 1024:
                raise HTTPException(413, 'Scene command exceeds 3 MB')
        import json
        try:
            command = json.loads(data)
            return await run_in_threadpool(service.execute, command)
        except SpeechAnalysisUnavailable as error:
            raise HTTPException(503, str(error)) from error
        except (ValueError, ValidationError, SpeechAnalysisError) as error:
            raise HTTPException(422, 'Invalid scene command: ' + command_error(error)) from error

    return router
