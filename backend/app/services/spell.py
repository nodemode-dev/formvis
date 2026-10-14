"""Spell checking for type layers (DEV_PLAN 32.7 part c), on pyspellchecker's word lists (MIT)."""
from functools import lru_cache

from spellchecker import SpellChecker

# formvis languages with a word list; every other language is checked against English.
_LANGS = {"en": "en", "es": "es", "it": "it"}


@lru_cache(maxsize=8)
def _checker(code: str) -> SpellChecker:
    return SpellChecker(language=code)


def _worth_checking(word: str) -> bool:
    if len(word) < 2 or any(ch.isdigit() for ch in word):
        return False
    if not any(ch.isalpha() for ch in word):
        return False
    return not (word.isupper() and len(word) <= 5)


def check(words: list[str], lang: str) -> list[dict[str, object]]:
    """The words the language does not know, each with up to 6 suggestions, in the order given."""
    spell = _checker(_LANGS.get(lang, "en"))
    out: list[dict[str, object]] = []
    seen: set[str] = set()
    for word in words:
        if word in seen or not _worth_checking(word):
            continue
        seen.add(word)
        low = word.lower()
        if not spell.unknown([low]):
            continue
        found = spell.candidates(low) or set()
        ranked = sorted((c for c in found if c != low), key=lambda c: (-spell.word_usage_frequency(c), c))[:6]
        if word[:1].isupper():
            ranked = [c[:1].upper() + c[1:] for c in ranked]
        out.append({"word": word, "suggestions": ranked})
    return out
