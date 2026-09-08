# Animated 3D shots and review numbers

Video 3D keeps the exact GLB animation index/name pair. The selector now labels
animations, displays their durations, and offers speed, source start time and
loop/hold controls per object. Unknown-duration clips cannot be selected.
Controls affect preview and MP4 capture identically. A single play reaches the
exact last pose, including STEP tracks; seeking back reactivates a clamped action.

Shot JSON can be saved and reopened from the editor. Import validates render
settings, camera fields, light and unique object identities before mounting.
Saved upload/file URLs remain the source authority; JSON files do not embed GLBs
or make their source files portable. Filesystem/blob URLs retain the existing
transient-source handling. Imported dimensions determine preview and export.

`clipNumber` is optional, positive and integral. It is shown in preview and baked
into the encoded frame at the upper right. It is also included in the published
filename and recipe. It survives template changes with the rest of the shot.
This number is an editorial reference; it does not replace asset or attempt IDs.

`clipPlayback` stores `speed`, `start` (source animation seconds), and `loop`.
`motion` optionally stores a world-space destination, target yaw and linear or
smooth interpolation. Motion is currently authored through JSON; the transform
panel still controls its starting pose. Camera follow targets use the current
pose. No collision solver, retargeting or automatic foot contact is implied.

Three reusable templates use a procedural server citadel with no bundled user
media: `siege-ring`, `spell-duel`, and `victory-circle`. Content bindings and
animation names remain separate from these framing/layout templates.

## Validation and production observations

Unit tests cover exact STEP endings and backwards seeks, deterministic travel,
import rejection, source/clip roundtrip and optional number overlays. Real local
production exercised three separately uploaded animated GLBs, 66 browser-rendered
shots and full-song assembly. Private assets, music and generated videos remain
outside version control. Model animation names describe exported labels; they
are not a guarantee that the motion matches an editorial intention.

The local experiment found two independent Video Editor assembly concerns:

- Its returned file URL needs the explicit output workspace when downloaded by
  an automation client. A bare URL can resolve against the global default.
- Joining the 33 silent 30 fps shots through Video Editor produced 5,207/5,206
  frames versus 5,214 source frames. The first assembled video had a null-muxer
  DTS warning. This is a follow-up in Video Editor normalization/concatenation;
  this change does not claim to fix that backend. Deliverables were finalized
  from the original frame-complete shots through Scene Recordings, with their
  soundtrack supplied separately and an explicit frame count.

Original song lyrics and transcription stay separate. In this experiment the
beat detector provided useful timing, but automatic sections collapsed nearly
the whole song into “verse” and transcription omitted/rephrased parts. Storyboard
planning used those timestamps as clues, without replacing the supplied lyrics.

Next useful work: a persistent multi-shot 3D timeline with scoped audio, batch
export in the UI, named character instances, movement controls, contact/shadow
preview, and source-aware framing that warns when an orbit crosses the set.
