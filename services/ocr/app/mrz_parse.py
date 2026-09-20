"""Deterministic MRZ parsing and mapping to guest fields.

Open-source only: uses the pure-Python `mrz` library (no model downloads).
The image -> text step (Tesseract) lives in main.py; this module is the
deterministic, unit-testable core.
"""

from __future__ import annotations

import datetime as _dt
import re
from dataclasses import dataclass, asdict
from typing import Optional

from mrz.checker.td1 import TD1CodeChecker
from mrz.checker.td2 import TD2CodeChecker
from mrz.checker.td3 import TD3CodeChecker

_MRZ_CHARS = re.compile(r"[^A-Z0-9<]")

# Common Tesseract digit->letter confusions, applied only to fields that are
# strictly alphabetic in the MRZ spec (names, country/nationality codes).
_DIGIT_TO_ALPHA = {"0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B"}


def _alpha_fix(value: str) -> str:
    return "".join(_DIGIT_TO_ALPHA.get(ch, ch) for ch in value)


@dataclass
class GuestDocument:
    valid: bool
    document_type: str
    document_number: str
    surname: str
    given_names: str
    sex: str
    nationality: str
    issuing_country: str
    birth_date: Optional[str]
    expiry_date: Optional[str]
    raw_mrz: str

    def to_dict(self) -> dict:
        return asdict(self)


def _clean_line(line: str) -> str:
    return _MRZ_CHARS.sub("", line.upper().strip())


def extract_mrz_lines(text: str) -> list[str]:
    """Pick the MRZ candidate lines from arbitrary OCR text.

    MRZ lines are long, uppercase, and rich in the filler char '<'.
    """
    candidates: list[str] = []
    for raw in text.splitlines():
        cleaned = _clean_line(raw)
        # The '<' filler is the strong MRZ signal that keeps prose out; the
        # length floor is low because Tesseract often drops trailing fillers
        # (they are re-padded downstream from the fixed MRZ row length).
        if len(cleaned) >= 15 and "<" in cleaned:
            candidates.append(cleaned)
    return candidates


def _yymmdd_to_iso(yymmdd: str, *, is_expiry: bool) -> Optional[str]:
    if not re.fullmatch(r"\d{6}", yymmdd or ""):
        return None
    yy = int(yymmdd[0:2])
    mm = int(yymmdd[2:4])
    dd = int(yymmdd[4:6])
    if not (1 <= mm <= 12 and 1 <= dd <= 31):
        return None
    year = 2000 + yy
    try:
        date = _dt.date(year, mm, dd)
    except ValueError:
        return None
    if not is_expiry and date > _dt.date.today():
        # A birth date cannot be in the future: it belongs to the 1900s.
        date = _dt.date(year - 100, mm, dd)
    return date.isoformat()


def _normalize(line: str, length: int) -> str:
    """Pad/truncate an OCR line to the exact MRZ row length.

    Tesseract output length drifts by a character or two; MRZ checkers read by
    fixed offsets, so normalizing keeps birth/expiry/name aligned.
    """
    return line[:length].ljust(length, "<")


def _checker_for(lines: list[str]):
    if len(lines) >= 3:
        norm = [_normalize(line, 30) for line in lines[:3]]
        joined = "\n".join(norm)
        return TD1CodeChecker(joined, check_expiry=False), joined
    first_len = len(lines[0])
    if 34 <= first_len <= 40:
        norm = [_normalize(line, 36) for line in lines[:2]]
        joined = "\n".join(norm)
        return TD2CodeChecker(joined, check_expiry=False), joined
    norm = [_normalize(line, 44) for line in lines[:2]]
    joined = "\n".join(norm)
    return TD3CodeChecker(joined, check_expiry=False), joined


def parse_mrz(text: str) -> GuestDocument:
    """Parse MRZ text (raw OCR output or the MRZ lines themselves)."""
    lines = extract_mrz_lines(text)
    if len(lines) < 2:
        raise ValueError("MRZ non riconosciuta: servono almeno due righe.")

    checker, joined = _checker_for(lines)
    fields = checker.fields()
    return GuestDocument(
        valid=bool(checker),
        document_type=(fields.document_type or "").replace("<", "").strip(),
        document_number=(fields.document_number or "").replace("<", "").strip(),
        surname=_alpha_fix((fields.surname or "").replace("<", " ").strip()),
        given_names=_alpha_fix((fields.name or "").replace("<", " ").strip()),
        sex=(fields.sex or "").replace("<", "").strip(),
        nationality=_alpha_fix((fields.nationality or "").replace("<", "").strip()),
        issuing_country=_alpha_fix((fields.country or "").replace("<", "").strip()),
        birth_date=_yymmdd_to_iso(fields.birth_date, is_expiry=False),
        expiry_date=_yymmdd_to_iso(fields.expiry_date, is_expiry=True),
        raw_mrz=joined,
    )
