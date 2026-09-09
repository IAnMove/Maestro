# Procedural 3D scene spec (G3)

Status: the 2.5D compositor stays the **Video 2.5D** studio tab (`scene3d`).
Real 3D is a **separate Video 3D** tab (`world3d`) in `ui/src/features/scene3d/`.
They share asset pickers and GLB clip identity, not one overloaded panel.
Wizard hook: `hocuspocus:world3d-workflow-request` mounts the same template ids
later; 2.5D `video_3d` actions stay on the compositor. Private Meshy GLBs stay
off git. `_launch_runtime.py` is still not mounted for G2.

Related: [GLB animation import contract](GLB_ANIMATION_IMPORT_CONTRACT.md)
(`inspect_glb`, schema `glb-inspection-v1`).

## 1. What already exists

HocusPocus already has a **layered compositor** (UI tab **3D Video**,
`SceneAnimatorPanel`, persisted `Scene` in `ui/src/types/index.ts`). It is not
a 3D world editor.

| Capability | Current behaviour | Not implied |
|---|---|---|
| GLB in a composition | Isolated `model-viewer` instances; `src` is the gallery/file URL. Orbit/strip may duplicate a layer (cap 4). | Shared scene graph, collisions, shadows between layers |
| Clip playback | `animation.clip` is an **exact** `animation-name` string. Time comes from `getSceneClipTime` (`sceneClip.ts`) and `viewer.currentTime` while paused. | Clip identity by index; semantic idle/run/dance mapping |
| Viewer orientation | `camera-orbit` from `transform.rotationY` / `rotationX` (default X=75). Extra yaw via `orientation`. | A scene camera with a world-space eye/look |
| Camera layer | 2D pan/zoom/roll/shake applied to the frame. Parallax is a 2.5D multiplier. | Perspective camera, depth of field, occlusion |
| Lights | model-viewer defaults (`shadow-intensity`, `exposure`) | Authorable lights, IBL, shadow maps between objects |
| Export | Browser canvas capture of the live compositor. GLBs must be loaded. No server renderer. | Headless CPU/software frames for CI |
| Persistence | `Scene` JSON + PNG preview. Recipe reconstruction from the edited scene. | Asset IDs as the only GLB identity |
| Inspector (G1) | CPU report of names, durations, meshes, skins, materials, blocked URIs | Proof that a clip will play or that it is a dance |

Transforms are **percent of the frame**. `x: 50, y: 50` is centre. A GLB at
scale 1 occupies roughly 52% × 75% of the frame. This is enough to move a
known mesh over a plate. It is not enough for two characters to occlude, meet,
or share a floor plane.

Clip selection today is name-only. Duplicate glTF names are therefore
ambiguous. G1 reports `(index, exact name)` and `name_collision`; a future
selector must use that pair. Human labels must not rename clips.

## 2. ADR: compositor vs scene mode

### Options

| ID | Option | Keep 2D/2.5D? | Cost | Verdict |
|---|---|---|---|---|
| A | Keep extending the current model-viewer compositor | Yes | Low | Necessary for plates, cutouts, rain, music-video strips. Insufficient as a 3D stage. |
| B | Add a **separate scene mode** with a real graph (nodes, camera, light, clips by id) beside the compositor | Yes | Medium | Proposed minimum. |
| C | Replace the compositor with a general 3D engine | No | High | Rejected. Breaks Character Kits, atmospheres, 2.5D recipes, browser capture. |

### Decision

Ship **B** as a sibling, not a replacement. The 2.5D compositor stays the
**Video 2.5D** tab. The 3D stage lives in `ui/src/features/scene3d/` as the
**Video 3D** tab (`world3d`), not a toggle inside the compositor panel. G2’s
resolver remains unmounted; local GLB files are read in the browser only.
Mode A remains the path for existing templates and the Omarchy compositor work.

Criteria for choosing B for a shot: more than one mesh must share space,
occlusion, a camera move in world units, or a light. Otherwise stay on A.

## 3. Minimum 3D vertical (not fifty scenes)

Prove **one** rehydratable shot before a catalog:

- Two mesh objects (`subject_1`, `subject_2` or `subject_1` + `prop`)
- One camera
- One light
- One **synthetic** animated GLB built in tests the same way G1 does
  (`pack_glb` / `two_clip_scene` in `tests/test_procedural_glb_inspector.py`).
  G1 does not export a builder. The private Meshy file is not a fixture.
- Deterministic clock matching compositor export: `frame_count = round(duration * fps)`,
  frame `i` is `t = min(duration, i / fps)` for `i = 0 .. frame_count-1`.
  Specify the same rounding in Python and JS (do not mix Python half-even
  `round` with JS `Math.round` at `*.5` without an explicit rule).
- Preview + CPU/software export used by tests (no GPU, no model-viewer required in CI)
- Save and reopen: same asset IDs, clip indices, camera, light, first and last encoded frames

Units: metres, Y-up, right-handed, camera looks down −Z unless stored
otherwise. Do not mix frame-percent compositor space into this graph.

This vertical is **not** visual validation of Running/Hip Hop on the private
GLB. That asset stays off git and off the LAN gallery.

## 4. Camera families (technique, not content)

Families are shot techniques. They are not fifty near-duplicate templates.

| Family | What it does | Required parameters |
|---|---|---|
| Establishment | Wide hold or slow push onto the stage | eye, look, fov, duration |
| Follow | Keep a subject in frame | target slot, damping, offset |
| Orbit | Circle a subject | target, radius, height, azimuth start/end |
| Reveal | Occluder or camera move that discloses a subject | occluder slot or start/end eye |
| Encounter | Two subjects enter a shared frame | subject_1, subject_2, meeting point |
| Pursuit | Chase along a path | path, subject, lag |
| Product | Turntable / hero object | subject, orbit speed, light key |
| Musical | Camera reacts to an explicit beat/downbeat grid | grid id, downbeat impulse, limits |

Each family has a technique id, numeric parameters, and separate content
bindings (which asset sits in which slot). Do not mint variants to hit a
count. A large catalog comes **after** the vertical replays and rehydrates.

## 5. Slots and incompatible capabilities

Explicit slots:

- `subject_1`, `subject_2`
- `background`
- `prop` (repeatable, each with its own id)

Bindings store `asset_id`, `workspace_id`, and clip identity
`(clip_index, clip_name_exact)`. If the name at that index differs after
reload, the binding is invalid; do not search by alias.

When a capability cannot apply, it is visible and disabled with a reason from
the G1 report or the resolver, for example:

- no skins → skeletal clip UI disabled
- G1 `extensions_required` (copy of glTF `extensionsRequired`) → unsupported
- external buffers → blocked
- `name_collision` → picker must show index, not a single name
- kind not GLB → 409 from G2, not a silent image fallback

No magic aliases (`idle`, `run`, `dance`) unless that exact string is the
clip name.

The 2.5D compositor’s `seamlessHorizontal` / cylinder panorama has a 3D
sibling: an image slot with `loop: { cylinder: true, speed }` maps onto the
inside of an open Y-up cylinder (`CylinderGeometry`, BackSide,
RepeatWrapping). UV `offset.x = (t * speed) mod 1` scrolls the world. The
`run-loop` template is the treadmill shot: `subject_1` stays at the origin,
camera family `pursuit`, and the background cylinder moves. Clip selection
stays `(index, exact glTF name)`; do not infer Running. Any image background
can enable the same infinite cylinder without switching template.

Video 3D export is independent of the 2.5D compositor. The world editor paints
three.js frames (`paintWorld`) and encodes H.264 in the browser. It does not
call `SceneAnimatorPanel` recording. Published files are named `world3d-*`.

## 6. Time, persistence, languages

- Scene time is deterministic. Reuse offset/speed/trim/loop/reverse from
  `getSceneClipTime`, but only when G1 `duration_status=verified` and
  `duration_seconds` is a finite number. If duration is `unknown`/`invalid`,
  disable playback. Do not call `getSceneClipTime` with 0 or `undefined`
  (that helper treats missing duration as 0.001s and returns 0).
- Persistence uses opaque IDs (project, workspace, asset, run). Filenames are
  display. See [domain model](DOMAIN_MODEL_AND_ASSET_PROVENANCE.md).
- Languages stay separate: UI chrome, conversation, technical prompt, lyrics /
  dialogue, and quoted literals. UI locale must not rename clips.

## 7. QA that the vertical must pass (once implemented)

Cheap tests (no GPU, no private GLB):

- Camera/orbit interval maths
- Missing clip index/name pair
- Deterministic first and last encoded frames for the synthetic GLB
- Save → reopen equality of IDs and clip bindings
- Cancellation of export
- Simulated CPU export (software frames, hashed)

Local smoke (manual, after G2 + engine ownership):

- Real playback, loop, first/last frame, textures, aspect ratio
- Still not a claim that Meshy clip names describe the motion

## 8. Proposed follow-up PRs (do not start a stack)

| After | PR | Touches hotspots? |
|---|---|---|
| GROK-API-001 answer | G2 unmounted router + ASGI tests | No `_launch_runtime.py` |
| G2 + principal owns mount | Wire router in launch | **Yes** — `_launch_runtime.py` |
| Vertical approved | New scene-graph types + persistence (sibling of compositor `Scene`, not fields mixed into it) | Only if the principal transfers `ui/src/types/index.ts`; otherwise a new module |
| Types landed | CPU preview/export test harness | No compositor UI |
| Harness green | Scene-mode UI in a **new** panel/module | Do not land world-space editing in `SceneAnimatorPanel.tsx` unless the principal owns that PR |
| Never in this track | Omarchy videoclip, 2D Character Kit speech, 42003/42004 | Principal |

G3 stops here: this file. No second renderer, no buttons, no private GLB in
fixtures.
