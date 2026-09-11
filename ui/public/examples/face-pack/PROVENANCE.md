# Experimental CRT / skull face packs

Procedural talking mascots for Video 3D. Not a recording or clone of a person.

- Characters: CRT phosphor cartoon face and a cream cartoon skull. Face-only tiles
  with nine visemes (`rest M A E I O U F L`) and six expressions
  (`neutral happy angry worried surprised sleepy`).
- Images: Grok Imagine, 2026-09-11. Canonical stills, then `image_edit` for each
  mouth and expression. 9×6 sheets assembled in `ui/scripts/assemble_face_packs.py`
  (128 px tiles). Nested viseme mouths are composited onto expression rows.
- Rig: bundled `/examples/tv-head-humanoid.glb` for both roles. The skull is the
  same walker with a different face pack on `headfront`.
- Audio: `neutral-vowels.wav`, 8 s mono 22.05 kHz PCM. Two identical synthetic
  vowel passes (formant sines: A E I O U), no speech model and no voice clone.
  SHA-256 `66e633eefa7f4d34dd96139e5b298a47392562a493d5e833ecba4f759a51951e`.
- Packs: `tv-pack.png` SHA-256 `37a8693bf37edf3493b8b6341ed7bff92452f2026d588cba37f454f9dcb3f7e9`;
  `skull-pack.png` SHA-256 `3965a822e83f163c77bd8205769337d46bf16205ae42f54d4e5daffddf7aeb25`.
- Shots: `hangar-talk` (CRT 0–4 s, skull 4–8 s) and `sea-talk` (same track on
  the boat deck). Soundtrack is the WAV; character speech is silent so the
  vowels are not doubled.
- Intended use: experimental preview in Video 3D. Using it does not generate
  audio or download a model.
