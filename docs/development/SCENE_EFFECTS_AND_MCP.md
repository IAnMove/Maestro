# Scene SFX, speech and MCP

## Scene effects

Video 2.5D and Video 3D share **Scene SFX → Apply SFX showcase template**.
The template adds a 54-second track demonstrating 18 effects, three seconds each:
sparks, explosion, fireworks, confetti, rain, snow, embers, smoke, fog, bubbles,
stars, portal, shockwave, lightning, speed lines, scanline, aurora and laser.
It preserves existing layers, actors, camera and voices, replaces the SFX track,
and extends the scene if necessary. An empty 2D scene gets the bundled stage SVG.
Save the resulting scene JSON to reuse it with other assets.

Each cue has start/end, position in screen percent, size, intensity, color, seed,
and optional sound/volume. These are canvas overlays in screen space, including
in the 3D editor; they do not simulate volumetric particles or physical collisions.
Absolute scene time and a fixed seed make scrubbing and exports repeatable.
The sounds are local procedural synthesis, not a neural sound library or MMAudio.
MMAudio remains available separately in the existing audio tools.

Visual scenes allow up to 64 cues and 600 seconds. Exports that mix sound/voices
are limited to 180 seconds of output. Preview respects browser audio activation.
The same visual renderer paints both previews and MP4 frames.

## Speaking characters

Use the existing **Video 3D → Voice and lip-sync** controls. Choose a GLB, place
its mouth/eyes, attach a voice, then **Calculate gestures with Rhubarb (local)**.
Use interventions to schedule different speakers; each intervention keeps its
literal dialogue, source audio, trim offset, timing and phonetic cues.
Rhubarb must be installed as described in [VIDEO3D_SPEECH.md](VIDEO3D_SPEECH.md).
A static mesh can speak using the face overlay; a GLB does not need blendshapes.
Face placement is per model and must be reviewed visually.

MP4 publication preserves the embedded mix. If the browser cannot encode AAC
(for example Linux Chrome), it sends bounded mono PCM alongside the rendered
frames. The server uses FFmpeg to produce the audible MP4 in Videos. A failed
finalization is an error, not a successful silent speech export. The 3D local
MP4 download also retrieves the finalized file in this case.

## Shared operations

`GET /api/v1/scenes/commands` lists executable operations and JSON schemas.
`POST /api/v1/scenes/commands` accepts exactly `version`, `operation` and `input`:

```json
{"version":1,"operation":"scenes.effects.showcase","input":{"dimension":"2d","sound":true}}
```

| Operation | Inputs and result |
| --- | --- |
| `scenes.effects.catalog` | Empty input; returns the 18 presets and coordinate system. |
| `scenes.effects.showcase` | `dimension` 2d/3d, `sound`, optional native `document`. Returns the built-in template. Do not supply prompts or an effect list. |
| `scenes.effects.apply` | Native `document`, `cues`, optional `replace`. Cue IDs upsert; repeats do not append duplicates. |
| `scenes.speech.prepare` | Native `document`, exact `slot_id`, `clip_id`, `workspace`, existing `audio_filename`, literal `text`, scene `start`/`end`, source `offset`. Rhubarb analyzes up to 90 seconds and returns a scene with the intervention attached. |

These operations return a detached document, SHA-256, `state: prepared`,
`saved: false`, and `exported: false`. They do not save over a project, generate
a voice, admit a GPU job, or render a video. Reusing an intervention ID replaces
that intervention; other voices are preserved. Overlapping turns on one speaker
are rejected. The caller supplies the actual document and existing workspace
filenames; remote/host audio paths are not accepted.

Ask to the Wizard exposes these operations through `prepare_programmatic_video`
with `scene_command`. Try: “Prepare the 2D SFX showcase with all 18 effects and
sounds, and open the resulting scene.” The Wizard calls the same service,
validates the result, and opens it in the corresponding editor. It keeps the
returned document and a backup of the previous scene in session storage before
presentation; save/export remains explicit. A presentation failure reports an
error and retains the prepared document instead of claiming a video was made.
To attach speech through Wizard, supply the exact scene document and audio name.

MCP exposes the four operation names directly; its `tools/call` arguments use
`{"version":1,"input":{...}}` (the tool name selects the operation). Preparation
and Rhubarb run without an open browser. Rendering these scenes still uses the
native editor; this slice does not implement a headless server renderer.

## Enable and connect MCP

Open **Settings → Integrations → MCP**. The info icon explains access and use on
hover, keyboard focus, or touch. The toggle enables/disables access immediately.
Copy the newly issued key; status reads and logs never return it. Rotation
revokes the previous key. Keys are stored in `app/settings/mcp-access.json`
with mode 0600 where supported. A configured `HOCUS_MCP_TOKEN` takes precedence;
Settings can disable access, but environment-managed keys rotate outside the UI.

The endpoint is the app's existing address plus `/api/v1/wangp/mcp`. There is no
second listener or daemon. The HocusPocus process must be running. A client on
another machine uses the reachable LAN address shown when accessing the app
from that machine, rather than `localhost` on the client.

Use an HTTP-capable MCP client with an Authorization header. For clients that
support this configuration shape:

```json
{"mcpServers":{"hocuspocus":{"url":"http://APP_HOST:PORT/api/v1/wangp/mcp","headers":{"Authorization":"Bearer <YOUR_TOKEN>"}}}}
```

Client configuration keys vary. Transport: Streamable HTTP JSON-RPC POST,
protocol `2025-03-26`; GET is not an event stream. Initialize, send the initialized
notification, then list/call tools. Calls require the MCP bearer key even if LAN
auth is off; MCP uses its own token when shared-LAN protection is on. This does
not unlock other API routes. Disabled MCP returns 503; missing/wrong keys 401.

Enable/rotate requests are restricted to the application's own trusted origin
and retain normal LAN authentication. Keys grant the tools advertised by this
app; keep them in the client configuration and out of screenshots or prompts.

## Acceptance run (10 September 2026)

PR #299, based on development `729f784c`, includes three actual native-editor
exports: 2D and 3D 54-second effect showcases, plus a 13.5-second Nova/Byte dialogue.
All are 1280×720, 30 fps, H.264 with AAC, decoded completely by FFmpeg.
The two original robot models were authored procedurally for the demo.

The dialogue uses real local KugelAudio generations (`b618ac8a`, `ee70ef12`),
submitted through MCP `generation.speech`. Replaying the first intent returned
the same job ID. Rhubarb produced 33/32 cues: the first voice was uploaded and
analyzed through the native UI; the second through `scenes.speech.prepare`.
Native seek checks verified A speaking/B resting, both resting, B speaking/A
resting, and recovery after seeking backwards. The exported voice duration and
content were checked with the app's installed Whisper transcription.

The real MiniMax Wizard request initially invented unsupported showcase fields
and correctly failed. The capability guidance was corrected; repeating the same
request opened the returned 2D scene and reported prepared, not exported.
MCP initialize, tools/list, showcase/apply and speech preparation were called
from an external HTTP client. Settings enable/rotation, disable (503), reenable
(200), desktop hover help and mobile tap help were exercised in the real UI.

Known limits: this proves two demo models and local audio, not every GLB/voice.
The Wizard's natural-language speech preparation was not separately tested;
its shared operation and visible handoff were exercised independently. The
settings test uses the built app origin; a Vite proxy with another Origin is
rejected by the settings origin guard. Demo files and captures are local outputs,
not Git content. Independent agent review is still a separate evidence state.
