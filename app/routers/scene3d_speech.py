"""Small router mounted by the existing character-kit boundary, without loading AI runtimes."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from services.scene3d_speech import MAX_BYTES, SpeechAnalysisError, SpeechAnalysisUnavailable, analyze_voice


class SpeechMouthCue(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    value: str = Field(pattern="^[ABCDEFGHX]$")


class SpeechAnalysisResponse(BaseModel):
    mouthCues: list[SpeechMouthCue]
    recognizer: str = "phonetic"
    duration: float
    analysisSource: str = 'original'


def create_scene3d_speech_router() -> APIRouter:
    router = APIRouter()

    @router.get('/speech/capabilities')
    def capabilities():
        from services.vocal_isolation import isolation_capability
        from services.scene3d_speech import rhubarb_executable
        return {'rhubarb': bool(rhubarb_executable()), 'vocalIsolation': isolation_capability()}

    @router.post("/speech/analyze", response_model=SpeechAnalysisResponse)
    async def analyze(request: Request, isolate_vocals: bool = False):
        if request.headers.get("content-type", "").split(";")[0] != "audio/wav":
            raise HTTPException(415, "Expected audio/wav.")
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > MAX_BYTES:
                raise HTTPException(413, "Voice clip exceeds the 90-second limit.")
            data.extend(chunk)
        try:
            return await run_in_threadpool(analyze_voice, bytes(data), isolate_vocals=isolate_vocals)
        except SpeechAnalysisError as exc:
            raise HTTPException(400, str(exc)) from exc
        except SpeechAnalysisUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc

    return router
