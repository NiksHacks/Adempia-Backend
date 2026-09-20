"""OCR microservice for Adempia.

Open-source stack only (no paid APIs, no external model downloads):
- Tesseract OCR (image -> text)
- `mrz` pure-Python library (MRZ -> structured guest fields)

Endpoints:
- GET  /health              liveness
- POST /ocr/mrz             multipart image -> parsed document fields
- POST /ocr/mrz/text        JSON {"mrz": "..."} -> parsed fields (deterministic)
"""

from __future__ import annotations

import io

import pytesseract
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from pydantic import BaseModel

from app.mrz_parse import parse_mrz

app = FastAPI(title="Adempia OCR", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": "tesseract+mrz"}


def _image_to_text(data: bytes) -> str:
    try:
        image = Image.open(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Immagine non valida: {exc}") from exc
    # Grayscale + autocontrast improves MRZ legibility for Tesseract.
    image = ImageOps.grayscale(image)
    image = ImageOps.autocontrast(image)
    # OCR-B / MRZ charset only.
    config = "--psm 6 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"
    return pytesseract.image_to_string(image, config=config)


@app.post("/ocr/mrz")
async def ocr_mrz(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File vuoto.")
    text = _image_to_text(data)
    try:
        doc = parse_mrz(text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return doc.to_dict()


class MrzText(BaseModel):
    mrz: str


@app.post("/ocr/mrz/text")
def ocr_mrz_text(payload: MrzText) -> dict:
    try:
        doc = parse_mrz(payload.mrz)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return doc.to_dict()
