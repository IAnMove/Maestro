# Tijeral — how to make the cut-paper chapter in HocusPocus

The example is a **Story Lab** chapter. Each beat opens **Video 2D** (Scene Animator)
so you can edit the shot. The assembled episode is **not** an MP4 baked outside Hocus.

## Path (do this in the app)

1. **Story Lab** → **Load Tijeral cut-paper example**.
   Lore (world, cast, relationships, structure) is already filled.
2. Open **Structure**. Each beat has **Open in Video 2D**.
   - Plano 1 plaza → establishing shot
   - Plano 2 cola fría → Nilo / Berta dialogue
   - Plano 3 sticker → Kito slides in
3. In **Video 2D** you can move layers, swap mouths, attach speech, export MP4.
   Mouths are ordinary overlays (`closed` `small` `wide` `round`) parented to the puppet.
   Talking must not change the brow card.
4. Optional: a later beat can use **Video 3D** (`sceneLink.editor = video3d`) if a shot needs depth. This gag stays 2D.
5. Voices: attach WAV/TTS from **Video 2D** audio tracks (Qwen TTS in Hocus, or the example WAVs in `voices/`). Do not clone actors.

## What you author vs what the kit ships

| You (in Hocus) | Kit (bundled) |
|---|---|
| Edit lore in Story Lab | Bible + filled Story project |
| Open/edit each beat in Video 2D | Three `.maestro-scene.json` shots |
| Generate more puppets in Character Kit (style Recorte de papel) | Nilo, Berta, Kito stills |
| Record or Qwen-TTS the lines | Example WAVs to save time |
| Export MP4 from Video 2D | — |

## Face = front card

Square/rectangle glued on the paper head. Not a round portrait in a circle.
Not `tv-head-humanoid.glb`.

## Files

- `ui/src/features/cutPaper/storyProject.ts` — Story Lab chapter
- `ui/src/features/cutPaper/pilot.ts` — Video 2D compilers
- `ui/public/examples/cut-paper/shots/` — one scene per beat
