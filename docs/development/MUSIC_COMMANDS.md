# Studio music commands

Status: local, provider-free command boundary for `generation.music`, schema
version 2. This slice freezes and preflights one Studio song request; the
runtime adapter supplies the existing generation queue and worker.

## Envelope

```json
{
  "version": 2,
  "operation": "generation.music",
  "intent_id": "song-intent-1",
  "input": {
    "workspace": "my-workspace",
    "workspace_collection_id": "collection-id",
    "params": {
      "model_type": "ace_step_v1_5_xl_sft_lm_4b",
      "prompt": "[Verse]\nLiteral lyrics",
      "alt_prompt": "Warm acoustic pop with brushed drums",
      "_music_description": "Optional UI description, retained literally",
      "_music_instrumental": false,
      "duration_seconds": 20,
      "seed": 42,
      "num_inference_steps": 8,
      "guidance_scale": 1.0,
      "generation_mode": "audio",
      "_audio_sub_mode": "music",
      "image_mode": 0,
      "video_length": 0
    }
  }
}
```

`prompt` is the native lyrics field and `alt_prompt` is the native Music
Caption. Both values are retained byte-for-byte, including surrounding spaces
and newlines. `_music_description` is UI metadata and is never used as a
fallback for `alt_prompt`. `_music_instrumental` is retained as metadata and
does not rewrite the lyrics; the caller must send the native
`[Instrumental]` literal when that is the intended prompt. When supplied,
`lyrics_language` is retained literally and passed to the existing language
guard; it does not translate or rewrite the lyrics.

`freeze_studio_music_spec` returns detached `original` and `effective`
snapshots. The latter adds only deterministic Studio selectors and inactive
sentinels. The fingerprint covers version, operation, workspace, optional
collection ID and effective native parameters, while excluding `intent_id`.
The module does not call `freeze_music_spec`, which strips Story text and has
different remote/local semantics.

## Supported native surface

The first vertical registers exactly the installed local IDs
`ace_step_v1_5_xl_sft_lm_4b` and `minimax_music3`. Remote MiniMax, community
ports, SFX/MMAudio, speech, video, image, avatar and model3d controls are
outside this operation and are rejected. The native mode is always
`generation_mode="audio"` and `_audio_sub_mode="music"`; `image_mode=0`,
`video_length=0`, `multi_prompts_gen_type=2`, `repeat_generation=1` and
`batch_size=1` are exact sentinels. Active negative prompts and prompt
enhancement are rejected because both local handlers declare no negative
prompt support and enhancement would rewrite literal lyrics.

The command accepts the model-owned timing and sampling fields
`duration_seconds`, `num_inference_steps`, `guidance_scale`, `seed`,
`guidance_phases`, `temperature`, `top_p`, `top_k`, `audio_scale`,
`alt_guidance_scale`, `sample_solver`, `model_mode`, `settings_version` and
closed ACE custom settings (`bpm`, `keyscale`, `timesignature`, `language`).
The preparation layer fills omitted duration/steps/guidance/phases from the
selected native model definition or the documented handler defaults. Studio
uses the selected native handler's declared `duration_slider` minimum and
maximum; the Story-only `music_model_contract` minimum of 20 seconds is not
applied to Studio requests. The catalog maximum remains a safety ceiling. A
value outside those native controls is rejected before resource preparation;
it is never silently clipped.

ACE-Step's declared source selectors are `""`, `"A"`, `"B"` and `"AB"`.
`audio_guide` and `audio_guide2` are required exactly when their selector is
active. `audio_guide3` through `audio_guide6` are inactive for this music
handler. MiniMax-Music3 rejects every reference. References must be asset IDs
or canonical local API URLs and are resolved by `StudioSpeechResources`; host
URLs, traversal and absolute host paths do not cross this boundary.

LoRAs are accepted only when the selected model definition explicitly exposes
`enabled_audio_lora`; names, multipliers, model roots and file identities are
checked by the existing resource resolver. MiniMax-Music3 currently does not
advertise that capability. No model download, fallback or remote LLM is
performed by this command.

## Shared Studio metadata

The browser's common audio path currently serializes `_tts_original_prompt`,
`_tts_speaker_name1` through `_tts_speaker_name6` and `_tts_voice_count` even
for music. `_tts_original_prompt` is retained as bookkeeping (defaulting to
the literal lyrics only when omitted). Speaker names must be empty/null and
the voice count must be zero. Active voices fail closed rather than being
treated as music references. The UI adapter must project these known inactive
sentinels and must not send voice references or voice counts as a music
command.

## Runtime boundary and limits

`app/services/studio_music_preparation.py` calls the supplied execution policy
before model lookup, verifies the exact model definition and installed flag,
then prepares canonical resources. It returns detached native params and
resource identities. The parent runtime connects this result to the existing
`NativeGenerationOperation`, `TaskRegistry` and generation FIFO. This slice
does not create a music-specific reservation store, scheduler or worker and
does not cover Story's remote `MusicSubmissionStore` path.

The native facade remains responsible for final handler validation and actual
generation. Provider-free tests prove the contract, model capability guards,
reference/LoRA boundaries and input immutability; they do not prove GPU
inference or audio quality.

## Wizard authored fields

Studio and the Wizard capability use the same audio action parser. For an
explicit Studio Music execution request, named `prompt` (or `Lyrics/prompt`),
`alt_prompt` and `music_description` sections in the user message take precedence
over an LLM rewrite. A multiline section must end at the next named section;
inline fields end at the newline. Duplicate labels are ambiguous and are not
reconciled. This preserves spaces and line breaks for these bounded fields; it
is not a guarantee of literal extraction from arbitrary prose.

### Optional ACE-Step caption

ACE-Step accepts an empty or omitted `alt_prompt`; lyrics and `[Instrumental]`
requests do not require a style description. MiniMax-Music3 still requires a
nonblank caption. The UI builder and server freeze validate that distinction
before resource inspection or admission, preserving the original text and the
difference between an omitted field and an explicitly empty field.
