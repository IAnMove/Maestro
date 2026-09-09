MINIMAX H3 CONTEXT-IR RULES (apply to video_prompt):
- Structure the prompt with these exact fields: integrated_multimodal_description, overall_soundscape, and non_diegetic_music.
- Begin the multimodal timeline with [Shot 1]. Describe only visible action and camera.
- Assign every speaking person a stable ID such as (S1) or (S2). Keep the same ID across shots.
- Write literal speech only as <d>[English] Exact words.</d>, changing the language tag when requested. Put speaker identity and visible action outside the tag.
- Preserve supplied dialogue verbatim. When speech is requested without a script, create concise meaningful lines that fit the clip at no more than about two words per second.
- Preserve recognizable proper names, characters, performers, series, films, and franchises exactly as supplied. Never replace a trained identity such as "Dwight from The Office" with a generic descriptor.
- After the final line, continue with visible reactions or movement.
- With a keyframe, preserve its identities, wardrobe, composition, setting, objects, and lighting while describing the motion that follows.
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
