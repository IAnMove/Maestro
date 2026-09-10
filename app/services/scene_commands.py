"""Browser-independent scene preparation. No queue admission or implicit video export.

Operations return a detached, editable document. Replaying identical inputs cannot
append duplicate cues or overwrite a saved project. Callers own saving/exporting.
"""
from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator, ValidationError

CATALOG = json.loads((Path(__file__).parent.parent / 'shared' / 'scene_effects.json').read_text())
PRESETS = {entry['id']: entry for entry in CATALOG}


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)


class FxCue(Strict):
    id: str = Field(min_length=1, max_length=160)
    kind: str
    label: str = Field(default="", max_length=80)
    start: float = Field(ge=0, lt=600)
    end: float = Field(gt=0, le=600)
    x: float = Field(default=50, ge=0, le=100)
    y: float = Field(default=50, ge=0, le=100)
    size: float = Field(default=65, ge=1, le=200)
    intensity: float = Field(default=1, ge=.1, le=2)
    rotation: float = Field(default=0, ge=-180, le=180)
    color: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')
    seed: int = Field(default=1, ge=1, le=1000000)
    sound: bool = False
    volume: float = Field(default=.25, ge=0, le=1)

    @model_validator(mode='after')
    def valid_preset(self):
        if self.kind not in PRESETS or self.end <= self.start:
            raise ValueError('Use a catalog effect and an end later than start')
        self.color = self.color or PRESETS[self.kind]['color']
        return self


class DocumentInput(Strict):
    document: dict

    @model_validator(mode='after')
    def valid_document(self):
        value = self.document
        duration = value.get('duration')
        if value.get('version') != 1 or type(duration) not in (int, float) or not 0 < duration <= 600:
            raise ValueError('Use a version 1 scene with duration between 0 and 600 seconds')
        if 'slots' in value:
            if value.get('units') != 'meters' or value.get('up') != 'y' or not isinstance(value.get('camera'), dict) or not isinstance(value.get('light'), dict):
                raise ValueError('Invalid world3d document')
        entries = value.get('slots', value.get('layers'))
        if not isinstance(entries, list) or len(entries) > 500 or any(not isinstance(item, dict) for item in entries):
            raise ValueError('Use a 2D layers document or a world3d slots document')
        ids = [item.get('id') for item in entries]
        if any(not isinstance(identity, str) or not identity for identity in ids) or len(ids) != len(set(ids)):
            raise ValueError('Scene object IDs must be unique')
        if len(json.dumps(value, allow_nan=False)) > 2 * 1024 * 1024:
            raise ValueError('Scene exceeds 2 MB')
        return self


class EffectsApply(DocumentInput):
    cues: Annotated[list[FxCue], Field(max_length=64)]
    replace: bool = False


class EffectsShowcase(Strict):
    document: dict | None = None
    dimension: Literal['2d', '3d'] = '3d'
    sound: bool = True
    collection: Literal['all', 'anime'] = 'all'

    @model_validator(mode='after')
    def resolve_document(self):
        if self.document is None:
            bases = json.loads((Path(__file__).parent.parent / 'shared' / 'scene_bases.json').read_text())
            self.document = bases[self.dimension]
            if self.dimension == '2d':
                duration = 3 * sum(self.collection == 'all' or item['collection'] == self.collection for item in CATALOG)
                self.document['layers'][0]['animation']['duration'] = duration
        DocumentInput(document=self.document)
        return self


class SpeechPrepare(DocumentInput):
    isolate_vocals: bool = False
    slot_id: str = Field(min_length=1, max_length=160)
    clip_id: str = Field(min_length=1, max_length=160)
    workspace: str = Field(min_length=1, max_length=120)
    audio_filename: str = Field(min_length=1, max_length=300)
    text: str = Field(default='', max_length=4000)
    start: float = Field(ge=0, lt=600)
    end: float = Field(gt=0, le=600)
    offset: float = Field(default=0, ge=0, le=600)


OPERATIONS = {
    'scenes.speech.capabilities': (Strict, 'Read local Rhubarb and optional installed-only CPU BS-RoFormer availability. No model downloads or inference.'),
    'scenes.effects.catalog': (Strict, 'List 30 visual overlays, including magic/anime, and their local procedural sounds for 2D/3D. No AI generation.'),
    'scenes.effects.apply': (EffectsApply, 'Return an editable 2D/3D document with timed SFX. Matching cue IDs replace in place. No save or export.'),
    'scenes.effects.showcase': (EffectsShowcase, 'Return a reusable SFX showcase: all effects 90 seconds, or collection anime 36 seconds. Retains actors/camera and replaces only SFX. No save or export.'),
    'scenes.speech.prepare': (SpeechPrepare, 'Analyze an existing workspace voice with Rhubarb and attach it to an exact 3D speaker/clip. Optional isolate_vocals uses installed-only local CPU BS-RoFormer, preserving original playback. Returns an editable document; face calibration may be needed. No downloads, voice generation, save or video export.'),
}


def command_catalog():
    operations = []
    for name, (model, description) in OPERATIONS.items():
        schema = model.model_json_schema()
        definitions = schema.pop('$defs', {})
        envelope = {'type': 'object', 'additionalProperties': False,
                    'properties': {'version': {'type': 'integer', 'const': 1},
                                   'operation': {'const': name}, 'input': schema},
                    'required': ['version', 'operation', 'input']}
        if definitions:
            envelope['$defs'] = definitions
        operations.append({'name': name, 'description': description, 'mutation': False, 'inputSchema': envelope})
    return operations


def _effects(value):
    document = deepcopy(value.document)
    if isinstance(value, EffectsShowcase):
        presets = [item for item in CATALOG if value.collection == 'all' or item['collection'] == value.collection]
        document['duration'] = max(document['duration'], len(presets) * 3)
        cues = [FxCue(id=f"showcase-{item['id']}", kind=item['id'], start=i * 3, end=i * 3 + 2.8,
                      size=95, seed=i + 17, sound=value.sound, label=item['id'].replace('speedlines', 'speed lines').title()).model_dump() for i, item in enumerate(presets)]
        document['sfx'] = cues
        return document
    current = [] if value.replace else [FxCue.model_validate(cue).model_dump() for cue in document.get('sfx', [])]
    entries = {cue['id']: cue for cue in current}
    for cue in value.cues:
        if cue.end > document['duration']:
            raise ValueError('Effect timing exceeds the scene duration')
        entries[cue.id] = cue.model_dump()
    if len(entries) > 64:
        raise ValueError('Maximum 64 effects per scene')
    document['sfx'] = list(entries.values())
    return document


class SceneCommands:
    def __init__(self, workspace_dir):
        self.workspace_dir = workspace_dir

    def execute(self, command):
        if not isinstance(command, dict) or set(command) != {'version', 'operation', 'input'} or type(command['version']) is not int or command['version'] != 1:
            raise ValueError('Expected version, operation and input only')
        name = command['operation']
        if name not in OPERATIONS:
            raise ValueError('Unknown scene operation')
        model = OPERATIONS[name][0]
        value = model.model_validate(command['input'])
        if name == 'scenes.speech.capabilities':
            from services.vocal_isolation import isolation_capability
            from services.scene3d_speech import rhubarb_executable
            return {'version': 1, 'status': 'completed', 'result': {
                'rhubarb': bool(rhubarb_executable()), 'vocalIsolation': isolation_capability()}}
        if name == 'scenes.effects.catalog':
            return {'version': 1, 'status': 'completed', 'result': {'effects': deepcopy(CATALOG), 'coordinates': 'screen-percent'}}
        if isinstance(value, SpeechPrepare):
            from services.scene_speech_command import prepare_speech
            document = prepare_speech(value, self.workspace_dir)
        else:
            document = _effects(value)
        digest = hashlib.sha256(json.dumps(document, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        return {'version': 1, 'status': 'completed', 'operation': name,
                'result': {'state': 'prepared', 'document': document, 'sha256': digest,
                           'saved': False, 'exported': False}}

    def handlers(self):
        return {name: self._handler(name) for name in OPERATIONS}

    def _handler(self, name):
        async def handle(arguments):
            from starlette.concurrency import run_in_threadpool
            from fastapi import HTTPException
            from services.scene3d_speech import SpeechAnalysisUnavailable
            try:
                return await run_in_threadpool(self.execute, {**arguments, 'operation': name})
            except SpeechAnalysisUnavailable as error:
                raise HTTPException(503, str(error)) from error
            except ValueError as error:
                raise HTTPException(422, command_error(error)) from error
        return handle


def command_error(error):
    if isinstance(error, ValidationError):
        return '; '.join('.'.join(map(str, item['loc'])) + ': ' + item['msg'] for item in error.errors(include_input=False)[:5])
    return str(error).split('\n')[0][:500]
