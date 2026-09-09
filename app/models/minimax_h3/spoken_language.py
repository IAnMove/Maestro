"""Models-safe H3 language tags. No services, runtime, or torch imports."""
from __future__ import annotations

import re
import unicodedata
from typing import Any

SPANISH_LANGUAGE_RE = re.compile(r"\b(?:español|spanish|castellano)\b", re.IGNORECASE)
_EXISTING_TAG_RE = re.compile(r"^\s*\[([^\]]+)\]\s*(.*)$")
_CONTEXT_LANGUAGE_RE = re.compile(
    r"\b(?:en|in)\s+(español|Spanish|English|inglés|French|francés|"
    r"German|alemán|Italian|italiano|Portuguese|portugués|"
    r"Japanese|japonés|Korean|coreano|Chinese|chino)\b",
    re.IGNORECASE,
)
_CONTRACT_LANGUAGE_RE = re.compile(
    r"SPOKEN LANGUAGE CONTRACT:\s*Every generated spoken word must be only in\s+([^\.\n]+)",
    re.IGNORECASE,
)
_NEARBY_TAG_RE = re.compile(
    r"\[(Spanish|English|French|German|Italian|Portuguese|"
    r"Japanese|Korean|Chinese|Russian|Arabic)\]",
    re.IGNORECASE,
)


def _fold_marks(text: str) -> str:
    """Drop combining marks so 'qué' matches the Spanish function word 'que'."""
    return "".join(
        character
        for character in unicodedata.normalize("NFD", text)
        if unicodedata.category(character) != "Mn"
    )


def normalize_spoken_language(value: Any) -> str:
    return " ".join(str(value or "").split())[:120]


def h3_language_tag(value: Any) -> str:
    """Return a broad H3 label instead of inventing a regional tag."""
    language = normalize_spoken_language(value)
    if not language:
        return ""
    if SPANISH_LANGUAGE_RE.search(language):
        return "Spanish"
    folded = language.casefold()
    aliases = {
        "inglés": "English", "english": "English",
        "francés": "French", "french": "French",
        "italiano": "Italian", "italian": "Italian",
        "alemán": "German", "german": "German",
        "portugués": "Portuguese", "portuguese": "Portuguese",
        "japonés": "Japanese", "japanese": "Japanese",
        "coreano": "Korean", "korean": "Korean",
        "chino": "Chinese", "chinese": "Chinese",
    }
    for needle, label in aliases.items():
        if needle in folded:
            return label
    return language


def infer_h3_spoken_language(text: Any) -> str:
    """Infer a broad H3 language tag only when no authored tag exists.

    Short ambiguous phrases fall back to English. This is a compatible
    default, not a claim of certainty for every two-word line.
    """
    source = str(text or "")
    if re.search(r"[\u3040-\u30ff]", source):
        return "Japanese"
    if re.search(r"[\uac00-\ud7af]", source):
        return "Korean"
    if re.search(r"[\u0400-\u04ff]", source):
        return "Russian"
    if re.search(r"[\u0600-\u06ff]", source):
        return "Arabic"
    if re.search(r"[\u3400-\u9fff]", source):
        return "Chinese"

    raw = source.casefold()
    words = set(re.findall(r"[^\W_]+", _fold_marks(raw), flags=re.UNICODE))

    def folded_words(candidates: set[str]) -> set[str]:
        return {_fold_marks(item) for item in candidates}

    scores = {
        "Spanish": (
            3 * len(re.findall(r"[¿¡ñ]", raw))
            + len(words & folded_words({"que", "por", "para", "una", "está", "nadie", "aquí", "pero"}))
        ),
        "French": (
            3 * len(re.findall(r"[œêëÿ]", raw))
            + len(words & folded_words({"je", "vous", "avec", "une", "est", "pas", "mais", "ici"}))
        ),
        "Portuguese": (
            3 * len(re.findall(r"[ãõ]", raw))
            + len(words & folded_words({"você", "não", "uma", "está", "mas", "aqui"}))
        ),
        "German": (
            3 * len(re.findall(r"[äöß]", raw))
            + len(words & folded_words({"ich", "nicht", "und", "ist", "aber", "hier"}))
        ),
        "Italian": len(words & folded_words({"io", "non", "una", "sono", "che", "ma", "qui"})),
    }
    language, score = max(scores.items(), key=lambda item: item[1])
    if score:
        return language
    return "English"


def tagged_dialogue(language: str, text: str) -> str:
    """Canonical ``<d>[Language] words</d>`` block used by the Ref2VA quote path."""
    return f"<d>[{language}] {text}</d>"


def language_for_quoted_speech(words: str, context: str = "") -> str:
    """Prefer an explicit tag or contract; otherwise infer; else English."""
    source = str(words or "").strip()
    tagged = _EXISTING_TAG_RE.match(source)
    if tagged:
        label = h3_language_tag(tagged.group(1))
        if label:
            return label
    surrounding = str(context or "")
    requested = _CONTEXT_LANGUAGE_RE.search(surrounding)
    if requested:
        label = h3_language_tag(requested.group(1))
        if label:
            return label
    contract = _CONTRACT_LANGUAGE_RE.search(surrounding)
    if contract:
        label = h3_language_tag(contract.group(1))
        if label:
            return label
    nearby = _NEARBY_TAG_RE.search(surrounding)
    if nearby:
        return h3_language_tag(nearby.group(1)) or nearby.group(1)
    return infer_h3_spoken_language(source) or "English"
