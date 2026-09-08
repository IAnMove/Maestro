---
name: api-maestro-next-git
description: Automate Maestro workflows through its HTTP API and browser-based 3D compositor.
---

# Maestro API

## Clients

Use `clients/series_episode.py` for the recover-plan-apply-render workflow. Pass the reachable base URL discovered at runtime with `--base-url`; pass workspace, series, episode, and job IDs per invocation.

Use `clients/browser_cdp.mjs` when a workflow begins in the browser, notably Scene Animator canvas recording. Pass a separately launched Chromium debugging URL and the selected Maestro page URL at runtime. Use `--expression` or `--script` for page operations and `--screenshot` for visual verification. Scene Animator uses WebCodecs MP4 when available and MediaRecorder WebM as a fallback; `/api/v1/scenes/recordings` finalizes H.264 MP4 and publishes it in Videos with prompt, recipe, scene, and asset metadata.

Use `clients/asset_snapshot.mjs --base-url <reachable-url> --workspace <name> --asset-id <id> [--asset-id <id> ...] --output-dir <directory>` to download existing canonical audio/image assets and their exact catalog manifests. It verifies identity, workspace, file location and byte count, records SHA-256 and literal prompts, and refuses to overwrite snapshots. This client never starts a generation.

The SHA-256 is an observation of the downloaded bytes, not proof that the server
froze the file between catalog lookup and download. Preserve the manifest and
observed hash together; do not claim a server-provided content-addressed identity.

Use `clients/world3d_shots.mjs` during worktree UI development to open saved shot
JSON through the editor and render through its existing export/publication flow.
Pass `--cdp`, `--app-url`, `--plan`, `--output-dir`, and `--workspace`; the frontend
must expose Vite source modules and use English UI controls. Set
`PLAYWRIGHT_MODULE` only if Playwright is installed outside the client's module
resolution path. `--preview-only` produces contact frames without MP4s. Existing
local MP4s are skipped, so use a fresh output directory when changing a plan.

Use `clients/world3d_assemble.py` to assemble those published shots and their
soundtrack through Video Editor. Pass `--base-url`, `--plan`, `--render-dir`,
`--workspace` and `--output`. Plans contain ordered shot documents, titles,
source audio upload metadata, and optional source trim times. Validate the final
frame count: Video Editor normalization can shorten silent source clips.

## Operations

- `prepare-from-job`: copy durable outline/script stages from a recoverable planning job into the current episode and set its target duration through the episode API.
- `start-plan`: start one planning scope such as `shots` or `complete`.
- `plan-status` / `apply-plan`: inspect and apply a completed planning proposal.
- `start-render` / `render-status`: queue unapproved Series shots and inspect the durable render job.
- `episode` / `project`: inspect the current authoritative saved state.
- `set-status`: persist a verified episode lifecycle state after an external recovery or audit.
- Browser CDP evaluation and screenshots for Scene Animator preview/recording. The scene-recordings API finalizes and publishes the browser capture.
- `GET /api/v1/assets/{asset_id}` resolves canonical metadata and workspace locations. Use the returned scoped file URL; do not guess filenames from prompts.
- Story Lab can generate MiniMax Image-01 images through `POST /api/v1/comics/generate/minimax/jobs` with `prompt`, `aspect_ratio`, explicit `workspace`, and optionally one `subject_reference`. Poll the returned job ID. This is distinct from the global MiniMax chat provider and from local MiniMax video/music models.

## Runtime Inputs

- A caller-reachable Maestro base URL.
- For browser-only operations, a caller-reachable Chromium debugging URL and Maestro page URL.
- Workspace name plus stable Series Lab project and episode IDs.
- A source planning job ID only when recovering completed stages.

## Outputs

Every operation prints one JSON response to stdout. Planning and render starts return durable job IDs that can be polled after process or app restarts.

## Notes

Scene Recordings expects audio in `scene.audioTracks`, with filenames located in
the output workspace. Embedded input audio is discarded when that list is empty.
Recordings and Video Editor responses may return an unscoped file URL; append the
explicit request workspace when downloading it. Verify decoded frames, duration
and audio rather than relying on a successful HTTP response alone.

The server keeps canon snapshots immutable when an episode is saved. Applying a planning job performs its own stale-episode guard, so do not edit the episode between `start-plan` and `apply-plan`.

The active output workspace is a server-global default: `PUT /api/v1/workspaces/active` affects other clients. Creating a workspace does not activate it. Prefer explicitly scoped API requests during concurrent work; the stock Wizard UI does not yet offer per-tab workspace selection. Never clear someone else's Wizard conversation to isolate a run.

MiniMax Image-01 returns opaque images. Its current canonical manifest does not retain reference-image parent IDs; preserve the request and source identity in separate run evidence instead of claiming complete built-in lineage. Provider keys stay in server settings; clients must not print them or embed them in saved scripts.
