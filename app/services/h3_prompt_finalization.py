"""Last deterministic H3 prompt gate. No launch, wgp, engines, or providers."""
from __future__ import annotations

from .h3_prompt_policy import apply_h3_audio_policy


def finalize_h3_prompt(
    prompt: str,
    *,
    policy: str = "native",
    duration_seconds: float = 0,
) -> str:
    """Apply the shared native/legacy audio policy to an already compiled prompt."""
    return apply_h3_audio_policy(prompt, policy, duration_seconds)
