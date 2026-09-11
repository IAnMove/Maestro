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

## Not in this slice

Install/Update/Start/Reset profiles, splitting `requirements.txt`, skipping
Torch on Mac, catalog filters, and per-endpoint generate guards land in
later PRs. Linux/Windows NVIDIA behaviour must stay unchanged until those
guards are wired one hotspot at a time.
