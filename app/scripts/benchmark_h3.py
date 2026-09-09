"""Run reproducible H3 comparisons through an isolated running Hocuspocus API.

Never launches/stops the app or changes the user's main checkout. Requests,
status history and wall times are stored before moving to the next row.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import time
import subprocess
import shutil
import urllib.request
import urllib.error

PROMPT = ('Gag original de Seinfeld, estética de la serie de los años noventa, en el apartamento de Jerry. '
          'George Costanza, interpretado por Jason Alexander, sostiene una taza vacía con orgullo y dice: '
          '«He dejado el café para ahorrar». Jerry Seinfeld mira la taza, levanta una ceja y responde: '
          '«Ahora solo te falta dejar de comprar tazas». Plano medio de ambos, cámara fija, actuación natural '
          'y pausa cómica final. Diálogo en español de España. Sin risas enlatadas ni música.')


def request(base, route, body=None, method=None, timeout=1200):
    payload = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base.rstrip('/') + route, data=payload,
        headers={'Content-Type': 'application/json'}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'HTTP {error.code}: {error.read().decode()}') from error


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, default=str))


FUTURAMA_PROMPT = ('Gag original de Futurama, animación 2D con la estética de la serie, en la sala de Planet Express. Philip J. Fry, con su chaqueta roja y pelo naranja, muestra su móvil a Bender y dice: «Bender, he descubierto una cosa llamada ChatGPT». Bender, el robot gris, lo mira con desprecio y responde: «Pamplinas». Plano medio de ambos, cámara fija y pausa cómica final. Diálogo en español de España. Sin risas enlatadas ni música.')


def prepare(base, output, source=PROMPT, prefix=''):
    for style in ('faithful', 'creative'):
        path = output / f'{prefix}prompt-{style}.json'
        if path.exists():
            continue
        started = time.monotonic()
        result = request(base, '/api/v1/llm/enhance-prompt', {
            'prompt': source, 'model_type': 'minimax_h3', 'mode': 'video',
            'planning_style': style, 'h3_audio_policy': 'native',
            'duration_seconds': 10.125, 'max_new_tokens': 1200,
        })
        result['source_prompt'] = source
        result['elapsed_seconds'] = round(time.monotonic()-started, 3)
        result['llm_status'] = request(base, '/api/v1/llm/status')
        save(path, result)
        print(f'Enhanced {style}: {result["elapsed_seconds"]}s', flush=True)
    request(base, '/api/v1/llm/unload', {})


def matrix():
    rows = []
    def row(model, preset='', attention='sdpa', steps=20, style='faithful', audio='native', frames=243, profile=3):
        label = '-'.join([model, preset or 'base', attention, str(steps), style, audio, str(frames)])
        if profile != 3:
            label += f'-profile{profile}'
        rows.append(dict(id=label, model=model, preset=preset, attention=attention, steps=steps, style=style, audio=audio, frames=frames, profile=profile))
    row('minimax_h3')
    for model, workflow in [('minimax_h3','fl2va'), ('minimax_h3_full','fl2va'), ('minimax_h3_ref2va','ref2va'), ('minimax_h3_ref2va_full','ref2va')]:
        if model == 'minimax_h3':
            row(model, 'v1-ckpt500', steps=6)
        row(model, 'v4-step600-ema', steps=6)
        preset = f'alibaba-pai-{workflow}-pdd-8step'
        row(model, preset, steps=8)
        row(model, preset, attention='sol', steps=8, profile=3.5 if model == 'minimax_h3_ref2va_full' else 3)
    for model in ['minimax_h3_fused_turbo','minimax_h3_ref2va_fused_turbo']:
        row(model, attention='sla', steps=4)
        row(model, attention='sdpa', steps=4)
        row(model, attention='sla', steps=8)
    row('minimax_h3','alibaba-pai-fl2va-pdd-8step',steps=8,style='creative')
    row('minimax_h3','alibaba-pai-fl2va-pdd-8step',steps=8,audio='legacy')
    row('minimax_h3','alibaba-pai-fl2va-pdd-8step',steps=8,frames=486)
    row('minimax_h3_ref2va','alibaba-pai-ref2va-pdd-8step',steps=8,frames=486)
    return rows


def monitor_job(base, folder, row, active):
    job_id = active['job_id']
    last_message = None
    while True:
        status = request(base, '/api/v1/status/' + job_id, timeout=120)
        save(folder / 'status.json', status)
        message = (status.get('status'), status.get('message'), status.get('progress'))
        if message != last_message:
            print(row['id'], message, flush=True)
            last_message = message
        if status.get('status') in ('completed', 'complete', 'done', 'failed', 'error', 'cancelled', 'canceled'):
            break
        if time.time() - active['started_at'] > 5400:
            status = {'status':'timeout', 'job_id':job_id, 'note':'Job left visible; inspect before submitting further rows.'}
            break
        time.sleep(3)
    result = {'row':row, 'elapsed_seconds':round(time.time() - active['started_at'], 3), 'result':status}
    save(folder / 'result.json', result)
    return result


def run_row(base, output, row, reference=None, server_pid=None):
    if server_pid and not (output / row["id"] / "result.json").exists():
        from benchmark_h3_memory import MemorySampler
        sampler = MemorySampler(server_pid, output / row['id'])
        sampler.start()
        try:
            result = run_row(base, output, row, reference)
        finally:
            memory = sampler.finish()
        result['memory'] = memory
        save(output / row['id'] / 'result.json', result)
        return result
    folder = output / row['id']
    result_file = folder / 'result.json'
    if result_file.exists():
        return json.loads(result_file.read_text())
    active_file = folder / 'active.json'
    if active_file.exists():
        # The backend owns generation, independently of this client/browser.
        # Reattach to the recorded job instead of submitting a duplicate.
        return monitor_job(base, folder, row, json.loads(active_file.read_text()))
    defaults = request(base, '/api/v1/defaults/'+row['model'])
    prefix = 'futurama-' if row.get('scene') == 'futurama' else ''
    prompt_file = row.get('prompt_file', f'{prefix}prompt-{row["style"]}.json')
    prompt_data = json.loads((output / prompt_file).read_text())
    params = {**defaults, 'model_type': row['model'], 'prompt': prompt_data['enhanced'],
        'override_profile': row.get('profile', 3), 'multi_prompts_gen_type': 2, 'seed': 20260906, 'resolution': '864x480', 'video_length': row['frames'],
        'num_inference_steps': row['steps'], 'guidance_scale': 1, 'batch_size': 1,
        'minimax_h3_turbo_mode': bool(row['preset']), 'minimax_h3_turbo_preset': row['preset'],
        'activated_loras': [], 'loras_multipliers': '', 'override_attention': row['attention'],
        'minimax_h3_planning_style': row['style'], 'minimax_h3_audio_policy': row['audio'],
        'minimax_h3_text_encoder': 'gguf_q4_k_m',
        'sliding_window_size': 243, 'sliding_window_overlap': 18,
        'sliding_window_memory_override': True, 'sliding_window_discard_last_frames': 0,
        'skip_steps_cache_type': '', 'workspace': 'h3_benchmark',
    }
    if row['frames'] > 243:
        params['prompt'] = prompt_data['source_prompt']
        params['minimax_h3_reference_sequence'] = 'ref2va' in row['model']
    if 'ref2va' in row['model']:
        if not reference:
            result = {'row': row, 'result': {'status': 'blocked', 'error': 'reference image required'}}
            save(result_file, result)
            return result
        params['minimax_h3_references'] = [{'type':'image', 'path':str(reference), 'role': ('Fry and Bender in Planet Express' if row.get('scene') == 'futurama' else 'George Costanza and Jerry Seinfeld, the two characters in the apartment'), 'image_intent':'composition'}]
    save(folder / 'request.json', params)
    started = time.time()
    try:
        submission = request(base, '/api/v1/generate', params)
        save(folder / 'submission.json', submission)
        job_id = submission.get('job_id') or submission.get('jobId')
        if not job_id:
            raise RuntimeError(str(submission))
    except Exception as error:
        result = {'row':row, 'elapsed_seconds':round(time.time()-started, 3), 'error':str(error)}
        save(result_file, result)
        return result
    active = {'job_id':job_id, 'started_at':started}
    save(active_file, active)
    return monitor_job(base, folder, row, active)


def extract_reference(result, destination: Path):
    files = result.get('result', {}).get('output_files') or []
    if not files:
        return None
    app_dir = Path(__file__).resolve().parents[1]
    video = app_dir / 'outputs/h3_benchmark' / files[0]
    binary = shutil.which('ffmpeg')
    if not binary:
        import imageio_ffmpeg
        binary = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([binary, '-y', '-ss', '2', '-i', str(video), '-frames:v', '1', str(destination)],
                   check=True, capture_output=True, timeout=90)
    return destination.resolve()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base-url',required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    parser.add_argument('--prepare',action='store_true')
    parser.add_argument('--index',type=int)
    parser.add_argument('--indices',type=int,nargs='+')
    parser.add_argument('--auto-reference',action='store_true')
    parser.add_argument('--reference',type=Path)
    parser.add_argument('--futurama-reference',type=Path)
    parser.add_argument('--server-pid',type=int)
    parser.add_argument('--paired',action='store_true')
    args=parser.parse_args()
    rows = matrix()
    paired_rows = [{**row, 'id': row['id']+'-futurama', 'scene':'futurama', 'run_order':2} for row in rows]
    save(args.output_dir/'matrix.json', [item for pair in zip(rows, paired_rows) for item in pair] if args.paired else rows)
    if args.prepare:
        prepare(args.base_url,args.output_dir)
        if args.paired:
            prepare(args.base_url,args.output_dir,FUTURAMA_PROMPT,'futurama-')
    indices = args.indices or ([] if args.index is None else [args.index])
    reference = args.reference
    jobs = [(index, row) for index in indices for row in ([rows[index], paired_rows[index]] if args.paired else [rows[index]])]
    futurama_reference = args.futurama_reference
    for index, row in jobs:
        selection = args.output_dir / 'selected-indices.json'
        if selection.exists() and index not in json.loads(selection.read_text()):
            continue
        selected_reference = futurama_reference if row.get('scene') == 'futurama' else reference
        result = run_row(args.base_url, args.output_dir, row, selected_reference, args.server_pid)
        print(json.dumps({'index': index, 'id': row['id'],
            'elapsed_seconds': result.get('elapsed_seconds'),
            'status': result.get('result', {}).get('status'),
            'output_files': result.get('result', {}).get('output_files'),
            'error': result.get('error')}, ensure_ascii=False), flush=True)
        if result.get('result', {}).get('status') == 'timeout':
            raise SystemExit('Stopped: an unfinished job must be inspected before continuing.')
        if args.auto_reference:
            if row.get('scene') == 'futurama' and futurama_reference is None:
                futurama_reference = extract_reference(result, args.output_dir / 'reference-futurama.png')
            elif row.get('scene') != 'futurama' and reference is None:
                reference = extract_reference(result, args.output_dir / 'reference.png')
        from benchmark_h3_report import render
        render(args.output_dir, Path(__file__).resolve().parents[1] / 'outputs/h3_benchmark/h3-benchmark.html')
        if result.get('error'):
            # Continue only if the server is still reachable; never turn a
            # crashed runtime into twenty misleading configuration failures.
            request(args.base_url, '/api/v1/llm/status', timeout=15)

if __name__=='__main__': main()
