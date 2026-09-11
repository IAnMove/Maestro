# H04 scene packages — wired vs pending

Portable Video3D projects: `hocuspocus.scene-package` zip (document + hashed media).
A `#328` `.world3d.template.json` is a layout, not this package.

## Wired in this PR

- `app/services/scene_packages.py` — pack, preflight, import, hash dedupe, zip-slip/symlink/size/cinema guards.
- `app/routers/scene_packages.py` — isolated FastAPI factory (no `_launch_runtime` / Gradio).
  - `GET /api/v1/scene-packages/format`
  - `POST /api/v1/scene-packages/export`
  - `POST /api/v1/scene-packages/preflight`
  - `POST /api/v1/scene-packages/import`
- `ui/src/features/project-transfer/` — `ProjectTransferDialog`, client preflight/reassign, EN/ES copy (feature-local JSON).
- Tests: `tests/test_scene_packages.py`, `ui/tests/projectTransfer.test.ts`, `ui/tests/projectTransferUi.test.tsx`.

## Pending (reserved files)

| Surface | Status | Patch |
|---|---|---|
| `app/_launch_runtime.py` `include_router` | **pending** | `INTEGRATION_LAUNCH_RUNTIME.patch` |
| App / MainContent / Scene3DWorkspace mount | **pending** (#328 + unified-layout) | `INTEGRATION.patch` |
| `ui/src/i18n/resources.ts` namespace | **not required** (dialog uses feature-local copy) | optional snippet in `INTEGRATION.patch` |

Until the runtime patch is applied, construct the router in tests/scripts:

```python
from fastapi import FastAPI
from routers.scene_packages import create_scene_packages_router
app = FastAPI()
app.include_router(create_scene_packages_router(workspace_dir=..., uploads_dir=...))
```

Until the UI mount is applied, import the dialog:

```ts
import { ProjectTransferDialog } from './features/project-transfer'
```

## How to try it

1. Apply `INTEGRATION_LAUNCH_RUNTIME.patch`.
2. Apply the Scene3DWorkspace snippet in `INTEGRATION.patch` (after #328) or render `ProjectTransferDialog` from any owner of the current shot list.
3. Export two shots that share a GLB/voice; unzip and confirm one `media/<sha256>.glb`.
4. Import into an empty workspace; lips, screen, clip, texts, environment and SFX remain.
5. Repeat import: media count unchanged. Tamper a packed GLB → preflight asks for picker repair.

## Limits

- Unknown cinema extensions (`cinema`, `cinemaExtension`, `tools/cinema.js`) are rejected.
- Unknown document fields are listed and kept, not dropped.
- Failed import rolls back files written in that attempt; existing scene revisions stay.
- No second asset catalog; import publishes via `write_asset_manifest` + `save_world3d`.
