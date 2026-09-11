# Experimental mascot face packs

Procedural talking faces for Video 3D. Not a recording or clone of a person.

- Packs (9 visemes `rest M A E I O U F L` × 6 expressions
  `neutral happy angry worried surprised sleepy`):
  - `tv` — CRT phosphor cartoon
  - `skull` — cream cartoon skull
  - `voxel` — cube-head with anime eyes (blocky original, not a franchise figure)
  - `anime` — cel-shaded close-up
  - `cubeskull` — voxel skull with anime sockets
- Images: Grok Imagine, 2026-09-11. Canonical stills, then `image_edit` for mouths
  and expressions. Sheets assembled in `ui/scripts/assemble_face_packs.py` (128 px tiles).
- Rig: bundled `/examples/tv-head-humanoid.glb`. Each pack paints `headfront`.
- Audio: `neutral-vowels.wav`, 8 s mono 22.05 kHz PCM. Two synthetic vowel passes
  (formant sines: A E I O U). SHA-256
  `66e633eefa7f4d34dd96139e5b298a47392562a493d5e833ecba4f759a51951e`.
- Shots: `hangar-talk` and `sea-talk` (CRT + skull), `voxel-talk` (cube + voxel skull).
  Soundtrack is the WAV; character speech is silent so vowels are not doubled.
- In Video 3D, Voice and lip-sync exposes the five packs on the selected subject.
- Intended use: bundled experimental preview. Using it does not generate audio
  or download a model.
