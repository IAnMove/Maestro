# Scene Template Review sandbox

This tool reviews the candidate SceneTemplate catalog through the real
`SceneTemplateReviewPage` and `SceneAnimatorPanel`. It does not call a video
provider, an LLM, a model download service or another HocusPocus application.
Images and GLBs come from the catalog's procedural data URIs. MP4 export is the
existing browser compositor/exporter running under Playwright Chromium.

## Run

From the repository root:

```bash
npm --prefix ui run scene:review
```

The equivalent command from `ui/` is:

```bash
npm run scene:review
```

The default binds only `127.0.0.1` on an ephemeral port, creates a fresh
directory under the OS temporary directory, and prints:

```text
REVIEW_OUTPUT_DIR=/tmp/hocus-scene-template-review-…
REVIEW_URL_LOCAL=http://127.0.0.1:…/scene-template-review
```

The process remains open so the user can inspect the gallery and editor. Stop
it with Ctrl-C. The in-memory output index is intentionally not recovered after
a restart; the fresh directory remains available for inspection.

To render every candidate with the real browser exporter and leave the server
open afterwards:

```bash
npm --prefix ui run scene:review -- --render
```

Specific IDs may be appended after `--render` for a short review, for example
`--render cinema-establishing space-cruise`. A render failure sets exit code 1
and writes a `status: "render-failed"` JSON record. It never creates a fake
MP4, PNG or success record in place of the failure.

The provider-free HTTP contract can be checked without a browser or render:

```bash
cd ui
npm exec --offline -- tsx --tsconfig tsconfig.app.json --test tests/sceneTemplateReviewServer.test.mjs
```

LAN review is opt-in and accepts only an RFC1918 IPv4 address that is present
on a local network interface:

```bash
npm --prefix ui run scene:review -- --host YOUR_LOCAL_PRIVATE_IPV4
```

Replace `YOUR_LOCAL_PRIVATE_IPV4` with an address on your own local interface;
omit `--port` to avoid collisions. This is a local development tool, not a public
server: do not expose it through port forwarding or an internet tunnel.
LAN access is **read-only and unauthenticated**, for a trusted network only.
Use the loopback editor to save scenes or recordings. It is not a secure
multi-user service or the application's Library backend.
Dependencies must already be installed with the repository's UI setup. Rendering
requires the Playwright Chromium browser, plus `ffmpeg` and `ffprobe` on PATH.
The tool does not install them or download anything automatically.

Wildcard binds (`0.0.0.0`), public addresses and non-local hostnames are
rejected. The tool still prints the loopback URL; when LAN mode is enabled it
also prints `REVIEW_URL_LAN`.

## Sandbox contract

- The actual UI is built by Vite into the run's temporary `ui/` directory and
  served as indexed static files, not through a development server. There is no
  HMR/websocket or source-file endpoint. `/api` and `/classic` never proxy to the
  live backend. Known review routes are handled locally; unknown
  application APIs return HTTP 403 and are recorded by the status endpoint
  with a bounded diagnostic list.
- Every request must carry a `Host` header for the served loopback address
  (`127.0.0.1`, `localhost`, or the explicitly selected local RFC1918 address)
  and port. This keeps a loopback socket from accepting a DNS-rebinding host.
- POST requests with an `Origin` other than the served host or loopback on the
  same port return HTTP 403 before reading or writing a body.
- Request bodies are capped at 40 MB. Saved scene and recording names are
  generated UUIDs; file reads resolve through the server's in-memory index, not
  arbitrary paths supplied by a URL.
- Writes are serialized and restricted to the loopback listening socket. The
  conservative HTTP write budget is 128 outputs / 256 MiB (including the exact
  recording-sidecar bytes);
  partial I/O failures do not refund reservations. A request times out after
  30 seconds; incomplete headers after 10 seconds. Start a fresh sandbox when
  its budget is exhausted. Generated files remain for inspection, not auto-deleted.
  This is not a quota for the entire temporary directory: the trusted local CLI's
  build, preview copies and failure records are outside this HTTP write budget.
- Snapshots require `provided_only`, valid Scene v1 layer types, a safe template
  ID, at most 24 layers, 1920×1080, 30 seconds, and no audio tracks. Asset sources
  must be inline or relative references to this sandbox's indexed files. Absolute URLs
  (including another loopback hostname),
  unregistered local references, blob URLs and disk paths are refused on save.
- CSP restricts interactive browser media/network requests to this origin,
  data and blob sources; additional no-referrer/nosniff/frame-denial headers
  are sent. The production application's API remains outside this tool.
- Scene saves and MP4 recordings are written only below the run's `exports/`
  directory. Render previews and metadata are written only below `previews/`.
- The editable scene is saved and read back before each MP4 export. Each
  successful template has `<template-id>.mp4`, `<template-id>.png`, and
  `<template-id>.json`. Metadata includes catalog/template versions, variant,
  render status, source HEAD SHA, dirty state, MP4 SHA-256, dimensions,
  duration, measured FPS, editable-scene filename/hash, and the exact scene
  snapshot sent to the recording endpoint. A preview is published only after
  page-error, `ffprobe` dimensions/FPS/duration, and metadata checks pass.
- Metadata also records Node/Playwright/Chromium/ffmpeg/ffprobe versions, poster
  hash and input-reference hashes. Git HEAD and tracked-diff digest are checked
  before/after render. Dirty/untracked content is explicitly not fully reproducible;
  a URL hash is not a hash of remote media bytes. Merge/release state is not inferred.
- Failed renders receive a uniquely named `*.failure-<uuid>.json` record. The
  failure path never overwrites a success record or masks the original error
  when a same-name write is not available.
- The status is `rendered-not-approved`: a correct local render is evidence for
  review only, never an automatic catalog approval.

The HTTP status endpoint is available at
`/api/v1/scene-template-review/status` while the process is running. It reports
the blocked API paths and the current in-memory output count without claiming
durable persistence.

The HTTP recording test uses a synthetic `ftyp` header and checks **transport and
metadata only**, not a decodable MP4. Actual local render verification separately
uses ffprobe and the browser exporter. CI must not call models or require weights.
