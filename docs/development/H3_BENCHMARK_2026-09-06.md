# H3 Seinfeld benchmark — 2026-09-06

Requested by the user: compare the same Spanish Seinfeld gag across the added models and settings, including real generation and LAN access. This supersedes the earlier instruction to defer media acceptance. Results are measured on the isolated branch; main is untouched.

Hardware: RTX 4090 24 GB. Test runtime: isolated Torch 2.10.0/cu128, Triton 3.6.0, with existing non-Torch dependencies. Original application retains Torch 2.7.0/Triton 3.3.0. Sol requires the newer runtime; SLA can use the compatibility runtime.

LAN: http://192.168.1.87:42004/ (HTTP server bound to 0.0.0.0; URL capture uses input.event[1]).

Launcher: `/home/ina/pinokio/api/Hocuspocus-h3-benchmark`. Code: `/tmp/hocuspocus-h3-adoption`. All generated media and records stay in the temporary checkout. Initial downloads and cold loads will be reported separately where logs expose them.

Planned reference prompt (identical source in every test):

> Gag original de Seinfeld, estética de la serie de los años noventa, en el apartamento de Jerry. George Costanza, interpretado por Jason Alexander, sostiene una taza vacía con orgullo y dice: «He dejado el café para ahorrar». Jerry Seinfeld mira la taza, levanta una ceja y responde: «Ahora solo te falta dejar de comprar tazas». Plano medio de ambos, cámara fija, actuación natural y pausa cómica final. Diálogo en español de España. Sin risas enlatadas ni música.

Common settings: seed 20260906; 864×480; 243 frames at 24 fps (10.125 s). Native sound policy unless the row explicitly compares legacy. Faithful and Creative start from the same text; their final prompts are saved separately. Reference tests reuse the same input image, generated from the baseline output when available. Timings for reference and unconditioned workflows are compared within their own groups.

The 12 priority clips are complete. See the final user review below; earlier chronological notes marked “audio pending” are superseded by that review.

## Diagnostic attempts (excluded from performance comparisons)

- The first model load exposed an optional upstream file-locator logging API absent in Hocuspocus; the adapter now uses a local path fallback.
- Initial Gemma4 outputs preserved Spanish dialogue but omitted speaker IDs; deterministic binding now preserves those outputs instead of discarding them. Final enhancement requests took 8.522 s (faithful) and 6.276 s (creative), each including a validation retry. The local llama.cpp binary uses Vulkan on the 4090; `device=cuda` in the old generic status is not a claim that this binary uses the CUDA backend.
- A raw multi-line Context-IR prompt was split into its three fields by the generic engine. H3 now declares a single block; the benchmark also explicitly requests that mode.
- Profile 5 reduced resident model memory too far for meaningful speed comparison. Profile 3.5 avoided pinning but overlapped disk-heavy downloads and validation, and its first baseline step took 848.52 s. These interrupted baseline attempts are retained under `outputs/h3-benchmark/*-diagnostics` and excluded from final rankings.
- All Fused bytes were eventually downloaded and verified against upstream SHA256 `4262e4e9963c553fa00016bbe83961407a4fc0a888be95fd836c8d4f2304e48b`. A partial 2 GB download initially failed verification, correctly preventing its use.
- Subsequent runs use profile 3, with downloads and our heavy validation stopped. The original main instance remains running; background host activity is not controlled, so these are practical local timings rather than laboratory measurements.

## Paired runs and memory telemetry (user-requested extension)

Each configuration now has two consecutive clips: the original Seinfeld prompt, then a Futurama scene with Fry saying “Bender, he descubierto una cosa llamada ChatGPT” and Bender replying “Pamplinas”, in Spanish. The second run tests a warm model, but is not an identical-input speed experiment: content and reference conditioning can affect runtime. Backend phase timings distinguish loading, prompt encoding, denoising and decoding. No cold/warm designation is inferred merely from run order.

The local API benchmark client accepts `--paired --server-pid <verified-test-server-pid>`. It samples the server process and children every second through psutil and NVML: RSS, PSS, process swap, per-process GPU memory, total GPU usage, system RAM unavailable and system swap. Each row saves the baseline, raw JSONL samples and sampled peaks. Process GPU usage includes allocator reservations. System values include the original app and other software. Sampled peaks are lower bounds on actual transient peaks, not guaranteed minimum hardware requirements. Earlier diagnostic videos have no retroactive memory measurement.

The user reviewed the first diagnostic clip and judged its audio perfect, with recognizable Seinfeld characters and setting. Independent Whisper small transcription contained two substitutions; this is an ASR observation, not evidence overriding the user's listening assessment. Those first two clips used SDPA fallback and cannot demonstrate Sol speed gains.

## Priority selection

After the user questioned the size of the 48-video matrix, the first pass was reduced to 12 videos: paired Seinfeld/Futurama for Pruned FL2VA PDD/Sol, Full FL2VA PDD/Sol, Pruned Ref2VA PDD/Sol, Full Ref2VA PDD/Sol, Fused Frames 4-step/SLA and Fused Ref2VA 4-step/SLA. Other configurations remain available in the script for targeted follow-up, not automatically queued. `selected-indices.json` can narrow subsequent submissions without affecting a running backend job. Reattaching the client preserves prior memory samples and peaks.

First successful Sol cold clip: 645.288 s client wall time (644.995 s backend task total), 34.384 GiB peak process PSS, 21.217 GiB peak process GPU memory and 3.938 GiB peak process swap. The inner sampling loop logged 130.72 s, while the API's broader Denoising phase recorded 254.89 s. Loading 123.675 s, adapter preparation 12.552 s, prompt encoding 86.567 s, decode 166.914 s. These scopes must not be conflated when reporting speed gains. Earlier dense-fallback clips took 776.059 s and 858.245 s; host load/caching varied. Ten sampled frames from the Sol clip preserve recognizable characters, apartment, clothing and cup. Audio assessment of this new clip remains pending.

Pruned PDD/Sol warm Futurama clip: 298.694 s client wall time; no transformer reload. Prompt 90.372 s, Denoising 119.578 s, VAE decoding 80.114 s; backend total 298.256 s (includes adapter preparation before the first named phase). Peaks: process PSS 18.667 GiB, process GPU 21.496 GiB, process swap 5.403 GiB. Lower resident RAM alongside more swap is not a comparable reduction in the model's minimum memory requirement. Ten sampled frames show clearly recognizable Fry/Bender, stable 2D style, smartphone and room. Audio/lip-sync review remains separate.

Full PDD/Sol cold Seinfeld: 664.501 s wall time; load 199.224 s, adapter 9.068 s, prompt 127.233 s, denoising 177.374 s, decode 146.200 s. Peaks: process PSS 37.063 GiB, GPU 20.902 GiB, process swap 6.763 GiB; system RAM unavailable 58.339 GiB and system swap used 18.775 GiB. Ten sampled frames retain characters and scene, without a clear visual improvement over Pruned in this limited inspection. Audio pending. The system-level RAM peak is particularly relevant: process RSS/PSS alone does not describe the full host impact of CUDA/offloading and other applications.

Full PDD/Sol warm Futurama: 901.448 s wall time; prompt 129.569 s, denoising 197.863 s, decode 562.916 s. Peaks: process PSS 10.664 GiB, process GPU 21.152 GiB, process swap 6.766 GiB, system RAM unavailable 58.626 GiB and system swap 18.744 GiB. Memory PSI `full avg60` was observed at ~16.6% during the prolonged decode. This warm run is slower than cold; model reuse is not a promise of lower total time under host pressure. Sampled frames retain Fry/Bender and the style; no clear visual gain over Pruned. Audio pending.

Adaptive choice: Full Ref2VA priority pair uses profile 3.5 (without pinning), to test a less stressful memory configuration after the above Full profile-3 result. Other pairs retain profile 3. Fused pairs now precede Full Ref2VA. This remains 12 priority clips; the comparison explicitly labels the differing profile, and any RAM/time difference cannot be attributed solely to model architecture.

Pruned Ref2VA PDD/Sol cold Seinfeld: 514.631 s wall time; load 114.059 s, adapter 13.925 s, prompt/reference preparation 218.696 s, denoising 135.892 s, decode 25.544 s. Peaks: process PSS 38.285 GiB, process GPU 21.385 GiB, process swap 5.889 GiB; system RAM unavailable 55.994 GiB and swap 17.313 GiB. Ten sampled frames retain scene/clothing/general composition; faces/hair and collar details differ, so reference conditioning is not exact identity copying. Audio pending. Fast decoding relative to earlier FL2VA clips is observed, not attributed to an unverified cause.

Pruned Ref2VA PDD/Sol warm Futurama: 291.840 s wall time; prompt/reference preparation 141.615 s, denoising 111.500 s, decode 26.653 s. Peaks: process PSS 19.956 GiB, process GPU 21.615 GiB, process swap 5.730 GiB; system RAM unavailable 49.422 GiB, swap 17.183 GiB. Total is in the same practical range as FL2VA Pruned warm (298.694 s); no statistical speed claim from one sample. Frames retain reference drawing/phone/composition; Bender's mouth articulation is more pronounced, with audio/sync review still pending.

Fused Frames 4/SLA cold Seinfeld: 453.133 s wall time; load 131.375 s, prompt 55.206 s, denoising including first-use compilation 213.937 s, decode 46.155 s. SLA summary: 200 sparse calls, 85.7% effective block sparsity, zero dense fall-throughs. System RAM unavailable peaked at 48.100 GiB; process GPU 21.143 GiB and process swap 6.187 GiB. One process-tree PSS sample at timestamp 1788663714.942327 reports 83.048 GiB on a 62.6 GiB host, unlike the surrounding ~42 GiB samples. It is flagged as an inconsistent non-atomic process aggregate, retained raw, and excluded from hardware requirement interpretation. The sampler now separately records the main server and auxiliary-process aggregate, physical capacity, and partial-coverage flags after reattachment. Raw process values must never be advertised as an 83 GiB RAM requirement.

Fused Frames 4/SLA warm Futurama: 105.404 s wall time; prompt 36.350 s, denoising 45.295 s, decode 21.786 s. Peaks: process PSS 40.608 GiB, process GPU 20.807 GiB, process swap 3.031 GiB; system RAM unavailable 46.025 GiB and swap 15.523 GiB. Characters and animated style are recognizable in sampled frames; gestures are broader and Fry opens his mouth near the end. Speech must be assessed from audio, not inferred from mouth frames. This is the fastest completed priority clip so far; quality comparison is not finalized yet.


## Final user review and decoder provenance

The user reviewed the outputs and selected the dense-fallback Pruned FL2VA clip
with a 14m 18s displayed total (858.245 s client wall time) as the best visual
result and the only perfectly spoken audio in this comparison. Preserve its
original media and request under `sol-second-dtype-diagnostics/`. Its settings
are Pruned FL2VA, Alibaba PAI PDD 8-step, CFG 1, video shift 7, profile 3,
Qwen GGUF Q4_K_M, Faithful/native, 864×480, 243 frames, seed 20260906. The
request says Sol, but execution fell back to SDPA; replay must explicitly use
SDPA to reproduce that attention choice. A single preferred take does not
establish a general quality guarantee for dense attention.

The user also found both Fused workflows spectacularly fast, with some visual
quality loss and invented speech at the end. Other accelerated variants also
had invented speech at the end. Whisper transcripts are secondary observations;
they cannot override this listening review. In particular, the Fused Frames
Futurama ASR transcript containing only the requested lines is not proof of
clean audio. No generated video has been muted, cut or repaired to hide this.

All these attempts used the adopted streaming spatial-tile video decoder
(`video_vae.py`), which decodes one tile at a time and retains blended overlap
tails. Standard Pruned/Full models used `minimax_h3_video_vae_fp16.safetensors`;
Fused used `minimax_h3_video_vae_int8_convrot.safetensors`. All used the FP32
audio VAE. This does not establish which component caused the visual or audio
differences. It does not cover unrelated changes Grok may have made elsewhere.

Fused accepts 4–8 evaluations in the integrated sampler. Six would add two
evaluations (50% more than four); total wall time would not necessarily rise
by 50%, because model loading, encoding and decoding have separate costs.
More evaluations are not a demonstrated quality or speech improvement. The
user explicitly asked not to run the six-step experiment; none was launched.

## Completed priority measurements

Client wall seconds. RAM is sampled process-tree PSS, GPU is process allocation;
values include neither a minimum hardware guarantee nor an isolated machine.
The first/second scenes differ. Rows 11–12 use memory profile 3.5; all others
use profile 3. Fused cold RAM anomaly remains excluded.

| Model / scene | Total s | Process RAM peak GiB | Process VRAM peak GiB | System RAM unavailable peak GiB |
|---|---:|---:|---:|---:|
| minimax_h3 / Seinfeld | 645.3 | 34.38 | 21.22 | 50.25 |
| minimax_h3 / futurama | 298.7 | 18.67 | 21.50 | 49.75 |
| minimax_h3_full / Seinfeld | 664.5 | 37.06 | 20.90 | 58.34 |
| minimax_h3_full / futurama | 901.4 | 10.66 | 21.15 | 58.63 |
| minimax_h3_ref2va / Seinfeld | 514.6 | 38.28 | 21.38 | 55.99 |
| minimax_h3_ref2va / futurama | 291.8 | 19.96 | 21.62 | 49.42 |
| minimax_h3_ref2va_full / Seinfeld | 580.8 | 42.12 | 21.10 | 44.13 |
| minimax_h3_ref2va_full / futurama | 345.9 | 40.70 | 21.33 | 23.59 |
| minimax_h3_fused_turbo / Seinfeld | 453.1 | Excluded anomaly | 21.14 | 48.10 |
| minimax_h3_fused_turbo / futurama | 105.4 | 40.61 | 20.81 | 46.02 |
| minimax_h3_ref2va_fused_turbo / Seinfeld | 325.5 | 39.93 | 21.36 | 47.02 |
| minimax_h3_ref2va_fused_turbo / futurama | 129.5 | 24.88 | 21.04 | 47.32 |

## Model catalog presentation

Fused appears as **H3 · Modo rápido — Fotogramas / Referencias**, with the
Spanish/English explanation “Genera en 4 pasos; puede perder algo de calidad”.
The technical Fused identity and experimental status remain visible. Pruned,
Full and Legacy retain distinct entries; optional Sol attention and PDD/Turbo
presets do not become duplicate model entries. Existing enable/disable choices
in Modelos remain available.

The catalog exposes observed per-variant process RAM/VRAM maxima with resolution,
clip duration, hardware, profile, swap caveat, and the anomalous cold Fused RAM
exclusion. These benchmark values are descriptive and never gate generation.
The main selector keeps a compact name with a hover explanation; descriptions
and expandable memory details live in Modelos. No blanket “best quality” or “gibberish-free” label is used.


Catalog follow-up validation: TypeScript build, scoped ESLint, en/es catalog
parity, entry bundle budget (312,473 / 327,680 gzip bytes), and code-health
ratchet against base `43f75b9` pass. The full UI run passed 653/654 tests;
the sole failure was a stale recovery-dialog wording expectation. After
updating that expectation, all 10 tests in the affected recovery/H3 files
pass. The 3 benchmark-client tests pass. The new static UI is served on the
existing LAN test server without restarting generation or loading new weights.
Semantic Bridge controls require a backend capability flag and stay hidden
against the still-running older backend; this UI release does not claim a
Semantic Bridge video test.

Exit checklist for this follow-up: AGENTS snapshot/log inspection completed;
work stayed in the isolated app checkout; PINOKIO_HOME confirmed as
`/home/ina/pinokio`; no launcher files changed (the existing captured URL still
uses `input.event[1]`); original/main remains untouched by this work; no six-step
generation launched; documentation, localized UI and relevant checks completed.
