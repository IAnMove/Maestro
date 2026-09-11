# macOS compatibility contract

Status: Phase 1 of `outputs/song-timings-20260911/PLAN_COMPATIBILIDAD_MACOS.md`.
Apple Silicon core/remote is the first supported Mac profile. Intel Mac is
explicitly out of the first launch. This document is the live contract, not
the full engineering estimate.

## Authority

`GET /api/v1/system/capabilities` is the platform authority. The UI and MCP
must not infer support from GPU names. Mutating endpoints that need a local
NVIDIA engine call `require_capability_http` and return `409` with
`detail.code = feature_unavailable`.

Each capability has `state` (`available`, `disabled`, `hidden`),
`reason_code`, optional `provider` and optional `alternative`.

- **hidden**: never offered when creating work on this machine.
- **disabled**: kept when opening a project/recipe that already used it;
  configuration is preserved; the user can switch to the `alternative`.
- Opening a Linux/NVIDIA project on Mac must not delete options or data.

## Profiles

| Profile | Machine | Local NVIDIA engines |
|---|---|---|
| `linux-nvidia-local` / `windows-nvidia-local` | Current default | available |
| `macos-arm64-core-remote` | Darwin arm64 | hidden |
| `macos-intel-unsupported` | Darwin x86_64 | hidden |
| `core-remote` | Forced non-NVIDIA | hidden |

Core surfaces that stay available on Apple Silicon: projects, editors,
Video3D, remote LLM/image/music/3D (including Meshy). FFmpeg and Rhubarb
are `available` only when the binary is present; otherwise `disabled`.

## Integration line

Work lands on `development-mac-integration`, not on `development`, until the
Apple Silicon profile can install and start. PRs into that line should be
large working slices, not a contract-only drip.

## Core/remote profile

`select_profiles("darwin", "arm64", …)` is supported via the `core` engine
(`app/env`, FastAPI/UI, no Torch). WanGP, MiniMax H3, Hunyuan3D, SAM and
UniRig stay unsupported and are skipped by `installEngines`. `launch.py`
starts `core_runtime` instead of `_launch_runtime` so the server does not
import CUDA. `POST /api/v1/generate` returns `409 feature_unavailable`.

Linux/Windows NVIDIA recipes and receipt IDs (`linux-x64-nvidia-wangp`)
are unchanged.
