"""Resolve existing local voice and reuse the native Rhubarb analyser."""
import subprocess
from copy import deepcopy
from pathlib import Path
from urllib.parse import quote

from services.scene3d_speech import analyze_voice, SpeechAnalysisUnavailable

VISEMES = dict(zip('XABCDEFGH', ['rest', 'M', 'I', 'E', 'A', 'O', 'U', 'F', 'L']))


def prepare_speech(value, workspace_dir):
    document = deepcopy(value.document)
    matches = [slot for slot in document.get('slots', []) if slot['id'] == value.slot_id and slot.get('media') == 'model3d']
    if len(matches) != 1 or not matches[0].get('sourceUrl'):
        raise ValueError('Select an exact 3D character with a saved model before adding speech')
    if value.end <= value.start or value.end > document['duration'] or value.end - value.start > 90:
        raise ValueError('Select a speech turn of up to 90 seconds within the scene')
    if Path(value.audio_filename).name != value.audio_filename or '\\' in value.audio_filename:
        raise ValueError('Use a workspace audio filename, not a host path')
    root = Path(workspace_dir(value.workspace)).resolve()
    path = (root / value.audio_filename).resolve()
    if path.parent != root or not path.is_file() or path.suffix.lower() not in {'.wav', '.mp3', '.flac', '.ogg', '.m4a'}:
        raise ValueError('Audio was not found in the selected workspace')
    if path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError('Voice exceeds 32 MB')
    try:
        converted = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-ss', str(value.offset), '-i', str(path),
                                '-t', str(value.end - value.start), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'],
                                   capture_output=True, timeout=45, check=False)
    except (subprocess.TimeoutExpired, OSError) as error:
        raise SpeechAnalysisUnavailable('Audio decoding is unavailable or timed out') from error
    if converted.returncode:
        raise ValueError('The selected audio could not be decoded')
    # ffmpeg's pipe WAV uses an unknown RIFF size. Rewrite bounded PCM to a proper WAV.
    import io
    import wave
    with wave.open(io.BytesIO(converted.stdout), 'rb') as source:
        pcm = source.readframes(source.getnframes())
    data = io.BytesIO()
    with wave.open(data, 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000); output.writeframes(pcm)
    analysis = analyze_voice(data.getvalue())
    reference = {'workspaceId': value.workspace, 'filename': value.audio_filename,
                 'url': f'/api/v1/file/{quote(value.audio_filename, safe="")}?workspace={quote(value.workspace, safe="")}'}
    clip = {'id': value.clip_id, 'text': value.text, 'start': value.start, 'end': value.end, 'offset': value.offset,
            'gain': 1, 'audible': True, 'audio': reference, 'driver': 'rhubarb',
            'cues': [{'start': cue['start'] + value.offset, 'end': cue['end'] + value.offset,
                      'viseme': VISEMES[cue['value']]} for cue in analysis['mouthCues']]}
    slot = matches[0]
    speech = slot.get('speech') or {'version': 1, 'enabled': True, 'cues': [], 'driver': 'imported',
        'start': 0, 'offset': 0, 'gain': 1, 'strength': .85, 'clean': True, 'style': 'soft',
        'lip': '#874d47', 'expression': 'neutral', 'blink': True, 'eyes': True}
    slot['speech'] = with_speech_clip(speech, clip, document['duration'])
    return document


def with_speech_clip(speech, clip, duration):
    prior = speech.get('clips')
    if prior is None:
        prior = []
        if speech.get('audio') or speech.get('cues'):
            legacy = {key: speech[key] for key in ('audio', 'cues', 'driver', 'start', 'end', 'offset', 'gain', 'audible') if key in speech}
            legacy['id'] = 'legacy-voice' if clip['id'] != 'legacy-voice' else 'previous-voice'
            legacy.setdefault('end', duration)
            prior.append(legacy)
    clips = {item['id']: item for item in prior}
    clips[clip['id']] = clip
    ordered = sorted(clips.values(), key=lambda item: item['start'])
    if len(ordered) > 32:
        raise ValueError('Maximum 32 interventions per character')
    if any(item['start'] < ordered[i - 1].get('end', duration) for i, item in enumerate(ordered) if i):
        raise ValueError('Interventions of one character must not overlap; set their end times')
    return {**speech, 'enabled': True, 'clips': list(clips.values())}
