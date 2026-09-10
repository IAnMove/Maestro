# H3 integration and speech experiments — 2026-09-06

User explicitly requested integrating current development while the GPU runs
four-step dialogue-tail comparisons. No remote PR, merge or release is requested.

- Generation checkout: `/tmp/hocuspocus-h3-adoption`, branch
  `feat/h3-maestro-adoption`, checkpoint `cbbb4995` (work in progress).
- Integration checkout: `/tmp/hocuspocus-h3-development`, temporary branch
  `feat/h3-development-integration`.
- Fetched development: `353a1225` (#165). The merge has no textual conflicts.
- Keep generation files stable until all eight videos complete. Validate the
  integration against the fetched development SHA; then fast-forward the original
  feature branch to the tested integration. Never change Grok's/main checkout.

The fetched branch already contains music server finalization and the P5 fake
worker (#163). Historical unchecked phase lists are not proof that the work is
absent. Its queue explicitly makes development the ordinary PR target. No open
PRs were returned by GitHub at inspection time; that is a snapshot, not a lock.

Parallel Grok recommendation: the bounded Director state-store extraction can
proceed from development, preserving public reexports and on-disk JSON schemas.
Our only change in director_pipeline.py is the H3 request-normalization helper
`_prepare_director_generation_params`; it does not move state-store functions.
Avoid simultaneous _launch_runtime.py work and leave H3 generation/recovery
helpers outside the extraction if their runtime dependencies are nontrivial.
No phase13 plan or queue reservation was added on the user's behalf.

## Speech experiment

Eight new Fused Frames/SLA clips, four steps, profile 3, seed 20260906,
864×480 and 243 frames / 10.125 seconds. Factors: two original lines vs one
additional meaningful line; quiet room ambience vs N/A; nonverbal final action
vs a brief explicit closed-mouth silence direction. All use the native duration
policy so removing ambience cannot silently shorten the clip.

A common, controlled visual description and identical Spanish anchor lines
isolate those factors. The added line “Estaba de oferta” is manually authored;
we do not claim that the LLM Creative enhancer produced it. Actual enhanced
prompts were retained and showed only two lines even in Creative mode. Their
source and generated text remain in the records.

The prior long VOCAL TIMELINE LOCK is removed from prompts and retained as
metadata. Existing generated controls stay unchanged. The integration also
qualifies the guide's unconditional no-extra-dialogue rule by writing mode;
that guide correction is not retroactively part of these eight prompts.

Records: `outputs/h3-speech-4step` in the generation checkout. Live comparison:
http://192.168.1.87:42004/api/v1/file/h3-speech-4step.html?workspace=h3_benchmark
All raw videos remain in the existing h3_benchmark workspace. Sampled RAM,
VRAM and swap are preserved per row. No tail trimming, muting or revoicing.

Semantic Bridge is separate, default off, capability hidden, and excluded from
Fused. All 23 CPU unit cases pass; none of these videos use it. The pinned published adapter was also downloaded to an isolated temporary validation directory: SHA256, exact keys/shapes and a finite CPU projection preserving dtype pass. No real Bridge video or media-quality improvement is claimed. H3 Max is
fal's hosted post-trained H3 variant; no public Max weights were located in the
primary sources inspected, so it is not one of our local models.
Source: https://blog.fal.ai/introducing-h3-max-by-fal/

## Validation and handoff

Human listening review is complete: the user reports perfect audio in all eight clips in this batch. Automatic transcription recognizes the two anchor lines in all eight clips, plus the manually authored extra line in the four expanded variants, without additional tail words. ASR can omit nonsense and is not proof of silence; it writes homophones “tasas”/“tazas” inconsistently. Do not equate a clean
Git merge, unit tests, automatic transcription or absence of a PR with media
quality or independent technical approval.

Cost: external paid provider calls 0; local generation 8 requested; two local
LLM enhancement calls took 20.555 s and 3.036 s, token counts not exposed (N/A).
Final completed count and per-video timings are recorded in result.json files.

## Measured speech results

All values are sampled peaks, not minimum hardware requirements. The process PSS does not include all shared-memory/cache pressure or the full machine workload. Keep the system RAM and swap alongside it. The first run includes cold loading; the last overlapped local code validation and cannot isolate prompt-induced latency. Other agents were also active on the host.

| Variant | Total s | Process RAM PSS GiB | Process VRAM GiB | System RAM GiB | Process swap GiB |
|---|---:|---:|---:|---:|---:|
| faithful-ambient-action | 400.407 | 31.95 | 20.47 | 48.12 | 1.83 |
| faithful-ambient-silence | 181.577 | 18.92 | 20.73 | 47.37 | 3.11 |
| faithful-none-action | 280.669 | 19.35 | 21.31 | 47.68 | 3.24 |
| faithful-none-silence | 138.601 | 15.22 | 20.80 | 46.99 | 2.68 |
| creative-ambient-action | 123.614 | 17.80 | 20.88 | 46.20 | 1.49 |
| creative-ambient-silence | 90.534 | 17.99 | 20.90 | 46.72 | 1.27 |
| creative-none-action | 90.561 | 18.24 | 20.88 | 46.39 | 1.27 |
| creative-none-silence | 277.882 | 17.90 | 20.92 | 49.07 | 2.89 |

All eight have raw video, prompt/request, timing, memory, contact sheet and ASR records. The live page includes automatic transcripts under configuration/evaluation and links to the earlier dense PDD 8 / SDPA reference. All eight variants pass the user’s listening review; this batch does not identify a uniquely superior audio preset.

Merged-tree validation: 2,035 Python tests passed (15 dependency deprecation/future warnings); 717 UI tests passed; 9 simulated browser tests passed; TypeScript/build, lint with zero warnings, i18n, dependency/documentation/brand/clean-repo guards and compileall passed. Entry JS gzip is 315,120 / 327,680 bytes. Two initial failures expected the intentionally removed long silence prose; updated assertions preserve literal dialogue and window isolation, then all 2,035 passed. Code-health ratchet uses development 353a1225. No independent agent QA or remote CI is claimed.

Deployment: feature branch fast-forwarded to integration commit 76fb8a01 after `/api/v1/jobs` returned an empty list. Only the temporary Pinokio benchmark app was restarted; LAN root and comparison page return HTTP 200. Original shared checkout remains on feat/local-minimax-music3 and its server remains alive. The reviewed Grok plan is the only file edited by this task in that checkout.

Post-deployment Creative enhancement check: the same source, 10.125 s and 1,200-token limit took 21.837 s and again returned only the two anchor lines. Saved as `outputs/h3-speech-4step/prompt-creative-after-guide-fix.json`. Creative permission is wired, but this check does not demonstrate automatic extra dialogue; the four expanded video prompts remain explicitly manual. Total local enhancement calls for this speech comparison/check: three, 45.428 s combined; tokens N/A, paid external providers zero.

## Human audio review — all eight pass

After listening, the user reported: “a nivel de audio han quedado todos perfectos en este caso”. This applies to all eight four-step speech variants above and supersedes their pending-listening status. It does not revise the earlier batch, which the user reported had hallucinated tails.

The common simplified prompt without the long VOCAL TIMELINE LOCK is a promising candidate explanation, not an isolated causal result: the earlier prompts also differed in other details. Neither extra dialogue, ambience nor an explicit silence ending was necessary to achieve good audio in this batch. Keep the successful prompts, raw videos and exact settings as regression references; no Semantic Bridge or automatic Creative extra-dialogue claim follows from this result.
