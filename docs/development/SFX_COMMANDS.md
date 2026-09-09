# Studio SFX command contract

`generation.sfx` is the version 2 command for the existing MMAudio sound
effects worker. It uses the shared command admission, receipt, task and
recovery path. Studio, Wizard and MCP share this runtime path. The visible SFX panel
acknowledges the exact command before admission; real model validation remains
separate acceptance work.

## Envelope

```json
{
  "version": 2,
  "operation": "generation.sfx",
  "intent_id": "sfx-intent-1",
  "input": {
    "workspace": "sfx-output",
    "workspace_collection_id": "optional-collection-id",
    "params": {
      "model_type": "mmaudio_v2",
      "prompt": "rain on a tin roof",
      "MMAudio_neg_prompt": "speech, singing",
      "duration_seconds": 5,
      "seed": 20260909,
      "guidance_scale": 4.5,
      "sfx_text_weight": 1,
      "video_guide": "/api/v1/file/guide.mp4?workspace=source"
    }
  }
}
```

The closed input accepts the registered virtual model IDs `mmaudio_v2` and
`mmaudio_nsfw`. `MMAudio_prompt` is accepted as the native spelling of
`prompt`; when both are supplied they must match exactly, including whitespace
and newlines. The optional `_mmaudio_variant` is checked against the selected
model and then derived again by the server. `MMAudio_setting` and `sfx_mode`
are inert legacy markers; the server recomputes them and does not treat them as
permission or download controls.

The original envelope is detached before any lookup. The effective snapshot
contains deterministic native sentinels (`generation_mode=audio`,
`_audio_sub_mode=sfx`, `image_mode=0`, `video_length=0`) and the derived
MMAudio variant. The fingerprint covers the effective operation, workspace,
collection (when present) and parameters, while excluding `intent_id`.
Caller provenance, queue controls, provider payloads, remote URLs, host paths,
video carrier model IDs and download flags are rejected by the closed schema.

## Duration and source behavior

Text-only requests require a finite duration greater than zero and at most 20
seconds. A video-guided request keeps its positive `duration_seconds` as the
requested control/provenance value, but preparation probes the canonical guide
and sets `duration_seconds_effective` and the worker `duration_seconds` to the
inspected guide duration. The two values must not be conflated.

`video_guide` must be an exact asset ID or a canonical local URL under
`/api/v1/uploads/...` or `/api/v1/file/...?...workspace=...`. The declared
source workspace is resolved before file lookup. The guide must be a readable
video with positive finite duration and positive dimensions. Its durable
resource record includes URL, source workspace, SHA-256, byte size, duration,
dimensions and basic stream metadata; it never includes a host path. A missing
selected guide is an admission error and cannot silently become text-only.

Text-only output is audio. Video-guided output is the original video with the
new MMAudio track, as implemented by the existing worker. The command does not
select or execute a video carrier model.

## Pure preparation interface

```python
prepare_studio_sfx(
    params,
    *,
    model_definition,
    model_downloaded,
    resources,
    execution_policy,
)
```

`model_definition(model_type)` and `model_downloaded(model_type)` are injected
catalog/install inspections. `model_downloaded` is the single required,
read-only dependency gate and must verify the complete installed-file set for
the selected model. A missing dependency produces `409`; no callback downloads
anything. The required files are exposed by
`required_mmaudio_files()` and match the files opened by `postprocessing.mmaudio`:
the selected v2 or NSFW weight, `mmaudio/v1-44.pth`,
`mmaudio/synchformer_state_dict.pth`, the DFN5B CLIP config/weights, and the
BigVGAN config/weights.

`resources` is a `StudioSfxResources` instance. It resolves the canonical
guide, probes it and returns a detached worker map plus portable identities.
`execution_policy(workspace)` runs before model/resource inspection. All
callbacks are read-only; scheduling, receipt creation, downloads and native
inference belong to the shared runtime boundary.

## Replay and recovery limits

The durable receipt must retain the original/effective command, fingerprint,
variant and resource identities. Before native work, the execution guard must
match operation, intent, workspace, task ID, backend job ID and the prepared
parameters, then re-check the guide identity and installed dependency set. If a
guide disappears or changes, the request fails closed and is not converted to a
different source or mode. Reusing an intent is for replay/recovery of that same
admission; a changed request needs a new intent.

This contract and its provider-free tests do not certify a GPU generation,
decoded WAV/MP4, or full Wizard/MCP presentation. Those require separate
runtime/UI acceptance evidence with an already-installed model.


## Runtime and visible Studio integration

The runtime registers SFX against the existing `_run_generation` worker. It does
not generate a carrier video. Admission checks all seven installed dependencies
and the worker rechecks them without downloading. A guide is hashed again before
model work; this detects changes before that check but is not an immutable copy
or protection against a later filesystem replacement.

The SFX panel displays the literal description, selected model, destination and
canonical guide. Without a guide it displays the requested duration; with a guide
it explains that output preserves the source duration and replaces its audio.
The selected source remains visible and removable after restoring settings. Its
source URL is retained even when the output belongs to another workspace.

Recovery reuses the original command and receipt. The typed worker publishes
full parameter sidecars for WAV and video-guided MP4 output. Tests exercise the
real worker function with a provider stand-in, plus SQLite admissions, concurrent
retries, changed-resource failures and DOM acknowledgement. These checks do not
certify actual MMAudio inference or media decoding.

## Wizard preparation

`prepare_audio` with `audio_sub_mode=sfx` uses the same registered parser as
other audio actions. It retains prompt and negative prompt literally and
validates seed, guidance, 25 steps, one output and text weight. Preparation
checks the effective command before changing the form; it never compiles a
language-contract suffix into the sound description.

Omitting `video_guide` retains the current selected guide. Explicit `null`
removes it. A nonempty canonical reference selects that source; empty action
strings and host/remote paths are rejected. The request duration is retained
until server preparation probes the guide. No-guidance requests are limited
to 20 seconds; the legacy SFX pack helper retains its separate clip behavior.

### Switching into the SFX form

Loading options for a virtual MMAudio model clears the previous model's options
locally and invalidates pending option requests. Boot, mode/model selection,
Wizard preparation and loading a sidecar use the same path. SFX must not inherit
video minimum durations or H3 Advanced controls, even when a late request succeeds
or fails. No MMAudio options or LoRA endpoint is fetched.

The Wizard schema and instructions distinguish omitting `video_guide` (keep the
selected guide), an explicit `null` (clear), and a canonical reference (replace).
Replacing guide audio does not mean clearing the guide. This instructs the LLM;
it is not a deterministic guarantee of natural-language interpretation. Parser
and form tests verify each actual action's semantics separately from real runs.
