# H07 handoff — reuse vocal analysis across shots

Branch `grok/agente1-h07-speech-analysis-cache-20260911` from `origin/development`.
Draft PR toward `development`. Do not merge.

## What shipped

- Persistent atomic cache (`app/services/speech_analysis_cache.py`) keyed by
  audio SHA-256, BS-RoFormer/Rhubarb identity, isolation/analysis parameters
  and the 90 s payload window. Same segment, three shots → one isolation and
  one Rhubarb run. Different windows stay different keys; they are never
  concatenated.
- `isolate_voice` / `analyze_voice` coalesce in-flight work. A failed worker
  does not publish a `.wav`/`.json` entry. Pins skip eviction while another
  consumer still needs the result.
- UI `decodeVoice` keeps a bounded (8) decoder cache. Simultaneous requests
  share one fetch; aborting one caller does not abort or drop the shared
  decode. `mixSceneSpeech` still mixes the original soundtrack URL.

CueTimeline was not edited (H06). 90 s analysis cap unchanged.

## Mock vs real isolation

| Circuit | Result |
| --- | --- |
| Isolation worker mocked (`subprocess.run` copies WAV, CPU/offline env still asserted) | **simulated PASS** — three shots, one worker |
| Rhubarb mocked (writes `mouthCues`) + isolation mock | **simulated PASS** — cue times identical, isolation once |
| Missing optional BS-RoFormer files | **simulated PASS** — `reason=optional_model_missing`, no download |
| Failure / `os.replace` error | **simulated PASS** — no partial cache file |
| Concurrent waiters; one abandoned | **simulated PASS** — shared result kept |
| UI decode cache + mix soundtrack | **simulated PASS** — original URL only |
| Installed BS-RoFormer `app/ckpts/roformer/*.ckpt,*.yaml` + `audio_separator` | **PENDING real** — tests never start a download |
| Real Rhubarb binary | **PENDING real** — not required for this PR |

Do not download vocal-isolation models to “complete” this lane. The worker
stays installed-only, CPU, `HF_HUB_OFFLINE=1`.

## How to try it

```bash
PYTHONPATH=app /home/ina/pinokio/api/Maestro-next.git/app/env/bin/python -m pytest \
  tests/test_speech_analysis_cache.py tests/test_vocal_isolation.py tests/test_scene3d_speech.py -q
cd ui && npx tsx --tsconfig tsconfig.app.json --import ./tests/setupI18n.ts \
  --test tests/scene3dSpeechAudioCache.test.ts
```

Cache dir: `SPEECH_ANALYSIS_CACHE_DIR` or `cache/speech-analysis/` (gitignored).
Limits: `SPEECH_ANALYSIS_CACHE_MAX_BYTES` (128 MiB), `SPEECH_ANALYSIS_CACHE_MAX_ENTRIES` (64).
