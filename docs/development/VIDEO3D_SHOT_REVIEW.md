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
`motion` stores a world-space destination, optional quadratic control point
(`via`), target yaw or tangent-facing (`faceTravel`), and linear/smooth timing.
The selected-model movement panel edits these fields; the transform panel sets
the starting pose. Travel spans the shot duration. Camera follow targets use the
current pose and optional world-space `eyeOffset`/`targetOffset` vectors.
The distance/speed label reports straight-line displacement, not curved arc length.

Three reusable templates use a procedural server citadel with no bundled user
media: `siege-ring`, `spell-duel`, and `victory-circle`. Content bindings and
animation names remain separate from these framing/layout templates.

Two additional reusable sets are `coder-room` (walls, shelves, physical desk,
keyboard and animated monitor) and `clone-chase` (a fixed road and lamps with
moving characters). Image slots can be unlit backdrops or lit wall/floor
surfaces, with editable texture repetition. Floor yaw stays horizontal.
The templates contain no private GLBs or generated images.

Optional `performance: "typing"` is a procedural arm gesture for rigs named
Left/Right Arm, ForeArm and Hand. Its keyboard target is 0.62 m ahead of the
slot origin and 0.91 m above it, matching the programmer set. It restores the
previous animation pose before resampling, including repeated/paused frames.
`grounded` aligns the animated mesh bounds with the slot's ground height before
the gesture. This is a coarse contact aid, not foot IK, retargeting, seating,
terrain collision or physics. Contact shadows are simple moving soft blobs.

## Animated lettering in 2D and 3D

Both editors expose the same `texts` cues and canvas painter: impact, upward
entry, terminal typing and letter wave. Cues store literal text, local start/end
seconds, position percentages, size as height percentage, color and tilt.
They survive scene/shot JSON, 2D recipe round trips and template changes, and
are baked into MP4s. Preview uses a bounded canvas; final output uses the export
resolution. Text draws over the image, below the optional clip number.

At most 12 cues and 240 characters per cue are accepted. Blank or invalid lists
do not add new fields to legacy 2D scene files. Cue timing is local to a shot;
3D global playback speed affects text and scene together. A recipe's scene text
defaults apply to each compiled shot. This does not provide lyric alignment,
karaoke word timings, occlusion by 3D objects or extruded 3D type.

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
export in the UI, named character instances, contact/foot IK, adjustable keyboard
targets, and framing that warns when an orbit crosses the set. The second local
iteration exercises all 33 original clip numbers with actual travel, clone
chases, a programmer room and generated environment materials. Image prompts,
provider/model identity, asset IDs and observed hashes are kept with the private
delivery so a generated texture is not mistaken for an authored source asset.
