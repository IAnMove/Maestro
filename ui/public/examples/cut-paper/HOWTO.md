# Cut-paper series kit — HOWTO

Living tutorial for **Tijeral**: construction-paper puppets, not a 3D walker.

Order of work (do not skip):

1. Write the bible (town, cast, voices, bans).
2. Scan or generate one **seamless cardboard** texture. Keep it.
3. Build **one** puppet: legs, torso, arms, square head, **square frontal face**, hat.
4. Mouth deck (`closed` `small` `wide` `round` in 2D; or 9×6 `rest M A E I O U F L` × expressions in Video 3D). Brows/eyes are a separate overlay.
5. Locations on the same cardboard + palette, front or very flat ¾.
6. Script, then original TTS/WAV (no cloned actors).
7. Layout → lipsync → hand slides (few in-betweens).
8. Assemble in Scene Animator 2D. `compileCutPaperPilotScene()` in `ui/src/features/cutPaper/` parents pieces to a root and binds mouths with `faceBinding`.

## Face = front card

The face is a **square/rectangle** glued on the paper head. It is not a round
portrait in a circle and not `tv-head-humanoid.glb`.

Mouth and expression stay independent: talking must not change the brow row.

## Code

- Ids: `ui/src/features/cutPaper/bible.ts`
- Puppet layers: `cutPaperPuppetLayers()`
- Pilot (78 s): `compileCutPaperPilotScene()`
- Open the compiled JSON in **Video 2D** (Scene Animator). Assets live under
  `/examples/cut-paper/`.

## Provenance

Every generated still is listed in `PROVENANCE.md` (Imagine, not a likeness
of a real child or actor).
