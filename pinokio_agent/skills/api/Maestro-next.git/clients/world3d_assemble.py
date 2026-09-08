"""Assemble numbered browser-rendered shots and music through the Video Editor API."""
import argparse
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
for name in ('base-url', 'plan', 'render-dir', 'workspace', 'output'):
    parser.add_argument('--' + name, required=True)
parser.add_argument('--name')
args = parser.parse_args()
plan = json.loads(Path(args.plan).read_text())
render_dir = Path(args.render_dir)
output = Path(args.output)
if output.exists():
    raise SystemExit(f'Refusing to overwrite {output}')

def request(endpoint, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(args.base_url.rstrip('/') + endpoint, data=data,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)

clips = []
for shot in plan['shots']:
    number = shot['document']['clipNumber']
    publication = json.loads((render_dir / f'clip-{number:02}.publication.json').read_text())
    saved = publication['saved']
    clips.append({'name': f'CLIP {number:02} — {shot["title"]}',
                  'source': saved['url'] + '?' + urllib.parse.urlencode({'workspace': args.workspace}),
                  'trim_start': shot.get('trim_start', 0),
                  'trim_end': shot.get('trim_end', shot['document']['duration']),
                  'muted': True, 'volume': 0, 'fit': 'contain', 'transition': 'none'})
body = {'name': args.name or plan['title'], 'workspace': args.workspace,
        'width': 1280, 'height': 720, 'fps': 30, 'clips': clips,
        'soundtrack': {'name': plan['sourceAssets']['song']['format']['tags']['title'],
                       'source': plan['sourceAssets']['song']['upload']['url'],
                       'trim_start': plan.get('audioStart', 0),
                       'trim_end': plan.get('audioEnd', float(plan['sourceAssets']['song']['format']['duration'])), 'volume': 1, 'loop': False}}
output.parent.mkdir(parents=True, exist_ok=True)
output.with_suffix('.editor-request.json').write_text(json.dumps(body, ensure_ascii=False, indent=2))
job = request('/api/v1/video-editor/export', body)
job_id = job['job_id']
output.with_suffix('.job.json').write_text(json.dumps(job, ensure_ascii=False, indent=2))
previous = None
while True:
    job = request('/api/v1/video-editor/export/' + urllib.parse.quote(job_id))
    current = (job.get('status'), job.get('progress'), job.get('message'))
    if current != previous:
        print(json.dumps({'job': job_id, 'status': current}, ensure_ascii=False), flush=True)
        previous = current
    output.with_suffix('.job.json').write_text(json.dumps(job, ensure_ascii=False, indent=2))
    if job.get('status') in ('completed', 'done', 'failed', 'cancelled'):
        break
    time.sleep(2)
if job['status'] not in ('completed', 'done'):
    raise SystemExit(json.dumps(job, ensure_ascii=False))
result = job.get('result') or job
url = job.get('url') or result.get('url') or '/api/v1/file/' + urllib.parse.quote(job.get('filename') or result['filename'])
parsed = urllib.parse.urlsplit(urllib.parse.urljoin(args.base_url, url))
query = dict(urllib.parse.parse_qsl(parsed.query)); query['workspace'] = args.workspace
url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))
with urllib.request.urlopen(url, timeout=120) as source, output.open('xb') as target:
    while chunk := source.read(1024 * 1024):
        target.write(chunk)
print(json.dumps({'output': str(output), 'bytes': output.stat().st_size, 'url': url}, ensure_ascii=False))
