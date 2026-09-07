# HOWUSEIT — Studio Tools (upscale, revoice, remove background)

Operator guide for **post-processing existing media**. Tools do not invent a
new shot: they take one exact image or clip, write a **new** file, and leave
the source untouched.

UI: Studio sidebar → **Tools** (`generationMode: tools`,
`ui/src/components/Sidebar/ToolsPanel.tsx`). HTTP:
`POST /api/v1/tools/upscale`, `POST /api/v1/tools/revoice`,
`POST /api/v1/tools/remove-background`. Workers:
`app/services/tools_upscale.py`, `app/shared/tools/`,
`app/_launch_runtime.py`. Poll and cancel with the shared job endpoints.

Related: [Video Editor](../video-editor/HOWUSEIT.md) (cut, do not regenerate),
[Character Kits Face Rig cleanup](../character-kits/HOWUSEIT.md)
(`POST /api/v1/character-kits/face-rig/cleanup` is a different rembg path),
[HTTP API](../../app/docs/API.md).

---

## 1. What this system is

| Tool | Accepts | Backend | Output |
|---|---|---|---|
| **Upscale** | Image or video | FlashVSR or Lanczos | New `_upscaled` PNG or video |
| **Revoice** | Video + 1–2 voice refs | SeedVC | New `_revoiced` clip (same container) |
| **Remove background** | Image | rembg U2Net | New `{stem}.no-background-{id}.png` |

Use Tools when the pixels (or voices) are already good and you need a
derivative. Use Studio generate when you need a new image/clip. Use Video
Editor when you only need trim, order, and export.

The three actions share the generation GPU slot, Activity footer, and
`GET /api/v1/status/{job_id}` / `POST /api/v1/cancel/{job_id}`. They are not
a second scheduler.

### Output folder versus Workspace collection

`workspace` on these routes is the **physical output folder**
(`default` or `[A-Za-z0-9][A-Za-z0-9_-]*`). It is not a logical Workspace
collection ID. Uploads use the virtual scope `__uploads__`. See
[domain model](../development/DOMAIN_MODEL_AND_ASSET_PROVENANCE.md).

---

## 2. Hard limits

1. **Never overwrite.** Every tool writes a new filename. A cancelled job
   deletes its partial output when the worker can settle the cancel.
2. **Exact source.** Prefer `asset_id` from `GET /api/v1/assets`. Otherwise
   send an exact filename, `/api/v1/file/...` or `/api/v1/uploads/...` URL,
   or an absolute path already inside uploads or a known output folder.
   Query strings are stripped; path traversal and mismatched asset IDs are
   rejected (`400` / `409` / `404`).
3. **`source_workspace`** is required when the file lives in another output
   folder than the destination. An unknown folder name is `404`. A file-URL
   `?workspace=` that disagrees with `source_workspace` is `409`.
4. **Conflicting aliases.** Upscale/revoice accept `source`, `source_path`,
   and legacy `video_path`. Two different values → `409`.
5. **Kind gates.** Revoice is video-only. Remove-background is image-only
   (`.png`, `.jpg`, `.jpeg`, `.webp`). Upscale images also allow
   `.bmp`, `.gif`, `.tif`, `.tiff`. Videos:
   `.avi`, `.m4v`, `.mkv`, `.mov`, `.mp4`, `.mpeg`, `.mpg`, `.webm`, `.wmv`.
6. **Instruction is metadata.** Remove-background accepts `instruction`
   (max 2 000 chars) and stores it on the job/sidecar. U2Net does **not**
   read it; the matte is the same with or without the note.

---

## 3. Operator workflow

1. Open Studio and choose **Tools** (Direct generation → Tools).
2. Pick **Upscale**, **Revoice**, or **Remove background**.
3. Set the source:
   - gallery card → **Use selected gallery image/clip**
   - image library picker (`GET /api/v1/assets?kind=image`, limit 100)
   - upload (`POST /api/v1/upload`; videos are accepted on the same route)
   - from a selected video: **Send to Tools** / quick upscale in the info bar
4. Set tool-specific parameters. Run. Watch the footer; the gallery refreshes
   on `completed`. Failed/cancelled tiles stay visible so you can inspect them.

Wizard can submit the same three capabilities through the tools adapter
(`ui/src/features/agent/toolsAdapter.ts`) with the same HTTP contracts.

---

## 4. Upscale

Methods (default `flashvsr2`):

```
flashvsr2, flashvsr3, flashvsr4, flashvsr2pass2, flashvsr2pass4,
lanczos1.5, lanczos2
```

FlashVSR is model-based super-resolution (weights download on first use).
Lanczos is a fast classic resize. If Settings → Services has FlashVSR mode
`0`, the panel warns but still lets you pick a FlashVSR method.

- Images go through the spatial upsampler in still mode and always become a
  new PNG (`_upscaled`). Optional `seed` is an integer (`-1` default).
- Videos keep the existing audio-preserving pipeline and write a new clip
  (`_upscaled` + configured container).

```bash
curl -X POST "$HOCUSPOCUS_URL/api/v1/tools/upscale" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "still.png",
    "source_kind": "image",
    "method": "lanczos2",
    "workspace": "default",
    "provenance": {"actor": "user"}
  }'
```

Legacy video clients may keep sending `video_path` instead of `source`.

---

## 5. Revoice (SeedVC)

Body: `{ video_path, voice_ref_paths: [1–2 paths], mode?: "single"|"two",
diffusion_steps?: 25, cfg_rate?: 0.5, workspace? }`.

| Mode | Effect |
|---|---|
| `single` (default) | Replace every voice with the first reference |
| `two` | Detect two speakers; first → Voice A, second → Voice B; keep music and silence |

Any other `mode` string is coerced to `single`. Voice refs may be audio or
video files resolved inside the destination folder or uploads. The worker
copies the source first, then converts the copy.

Failure cases you will actually see: clip has no audio, SeedVC is
unavailable, or no reference file could be resolved.

```bash
curl -X POST "$HOCUSPOCUS_URL/api/v1/tools/revoice" \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "take.mp4",
    "voice_ref_paths": ["ref-a.wav"],
    "mode": "single",
    "workspace": "default"
  }'
```

---

## 6. Remove background

Prefer `asset_id`. `source` alone is accepted. Destination `workspace`
defaults to the server active output folder.

```bash
curl -X POST "$HOCUSPOCUS_URL/api/v1/tools/remove-background" \
  -H "Content-Type: application/json" \
  -d '{
    "asset_id": "asset_image_123",
    "workspace": "default",
    "provenance": {"actor": "user"}
  }'
```

Accepted immediately with `job_id`, `task_id`, `root_task_id`, and frozen
`generation_details.model_type: rembg-u2net`. The sidecar records source
lineage, timings, and transparent-PNG metrics (`width`, `height`, `alpha`).

Face Rig overlay cleanup is a **different** endpoint
(`POST /api/v1/character-kits/face-rig/cleanup`) that also uses rembg U2Net
plus crop-to-alpha. Do not substitute one for the other.

---

## 7. Pitfalls

- Sending a `.bmp` / `.tif` to remove-background fails; those formats are
  upscale-only.
- Revoice on an image is rejected by both the panel and the HTTP
  `expected_kinds=("video",)` gate.
- `instruction` will not “preserve hair.” It is stored, not consumed.
- Two different `source` / `video_path` values fail with `409`, not a silent
  pick-one.
- Gallery URLs look like `/api/v1/file/clip.mp4?workspace=default`. The
  filename-with-query does not exist on disk; the server strips the query.
- Tools share the GPU lock with Studio generate. A long FlashVSR job blocks
  the next generation until it finishes or is cancelled.
