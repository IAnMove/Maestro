"""Extract review artifacts and optionally transcribe through the running API.

Run transcription after video generation, to avoid competing for GPU memory.
ASR text is evidence for listening review, never a gibberish pass/fail oracle.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from benchmark_h3 import request, save


def review(base: str, records: Path, transcribe: bool):
    app = Path(__file__).resolve().parents[1]
    binary = shutil.which('ffmpeg')
    if not binary:
        import imageio_ffmpeg
        binary = imageio_ffmpeg.get_ffmpeg_exe()
    for path in sorted(records.glob('*/result.json')):
        record = json.loads(path.read_text())
        files = record.get('result', {}).get('output_files') or []
        if not files:
            continue
        folder = path.parent
        video = app / 'outputs/h3_benchmark' / files[0]
        contact = folder / 'contact.jpg'
        if not contact.exists():
            subprocess.run([binary, '-y', '-i', str(video), '-vf', 'fps=1,scale=320:-1,tile=5x2',
                            '-frames:v', '1', str(contact)], check=True, capture_output=True, timeout=120)
        if transcribe and not (folder / 'asr.json').exists():
            identifier = hashlib.sha256(folder.name.encode()).hexdigest()[:12]
            audio = app / 'outputs/h3_benchmark' / f'benchmark-audio-{identifier}.wav'
            subprocess.run([binary, '-y', '-i', str(video), '-vn', '-ac', '1', '-ar', '16000', str(audio)],
                           check=True, capture_output=True, timeout=120)
            result = request(base, '/api/v1/audio/analyze', {'audio_path': str(audio),
                'workspace': 'h3_benchmark', 'transcribe': True, 'extract_vocals': False})
            save(folder / 'asr.json', result)
        print(folder.name, 'review artifacts ready', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--transcribe', action='store_true')
    args = parser.parse_args()
    review(args.base_url, args.output_dir, args.transcribe)
