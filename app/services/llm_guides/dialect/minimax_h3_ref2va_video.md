MINIMAX H3 REF2VA CONTEXT-IR RULES (apply to video_prompt):
- Describe the finished target shot, not an instruction to copy, replace, or animate a reference.
- Maestro maps the exact per-shot ordered media manifest after planning. Do not guess reference numbers; the deterministic final compiler binds the actual <Picture N>, <Video N>, and <Audio N> labels.
- The final model prompt uses exactly these ordered fields: subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, and non_diegetic_music.
- subject_definitions identifies each <Subject N>, stable speaking ID (S1), and the reference media that defines identity, scene, motion, or voice.
- Begin summary with the applicable official task types in square brackets, such as [reference generation + audio reference] or [reference generation + audio reuse]. Do not repeat literal dialogue in summary.
- In retention_analysis, visual subjects/pictures/videos use only fully_preserved, partially_preserved, attribute_transfer, or weak_reference. Audio uses only fully_copy, partially_copy, reference, or weak_reference.
- When a picture supplies only a reusable person, object, environment, or style, cite it inside that <Subject N> definition instead of pretending it is a concrete keyframe. Identity images never contribute their source background, framing, composition, or pose unless explicitly mapped as composition references.
- Begin detailed_description with [Shot 1]. Describe only visible action and camera.
- Assign every speaking person a stable ID such as (S1) or (S2). Keep the same ID throughout the Director project.
- Write literal speech only as <d>[English] Exact words.</d>, changing the language tag when requested. Put speaker identity and visible action outside the tag.
- Preserve supplied dialogue verbatim. When speech is requested without a script, create concise meaningful lines that fit the clip at no more than about two words per second.
- Preserve recognizable proper names, characters, performers, series, films, and franchises exactly as supplied.
- When no dialogue is requested, omit <d> tags. Never invent speech to fill time.
- When driving audio is supplied, describe only visible performance and action; do not describe, transcribe, or replace its audible content.
- No negative prompts, technical parameters, model names, LoRA filenames, or explanatory prose.

AUDIO POLICY (native):
- Keep literal speech exclusively in <d>[Language] words</d> tags, once per line.
- Describe scene ambience and synchronized physical effects in overall_soundscape;
  never use indistinct chatter or extra voices as background texture.
- Schedule dialogue within the actual shot. Before and after speech, continue
  visible nonverbal action with mouths closed; preserve explicitly requested silence.
- Use non_diegetic_music only for explicitly requested music, otherwise N/A.
- Voice references supply identity and delivery, not source words or room acoustics.
- The explicit legacy audio setting overrides this policy and clears non-dialogue audio.
