#!/usr/bin/env python3
"""
EasyOCR HTTP Server
Run: python scripts/paddleocr_server.py [--port 8081]

Requires:
    pip install easyocr fastapi uvicorn python-multipart
"""

import argparse
import tempfile
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI()

DEFAULT_PORT = 8081

# Global EasyOCR reader
ocr_reader = None


def init_ocr():
    """Initialize EasyOCR reader"""
    global ocr_reader
    if ocr_reader is not None:
        return

    try:
        import easyocr
        # Initialize with Chinese and English support
        ocr_reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)
        print("EasyOCR initialized successfully")
    except Exception as e:
        print(f"Failed to initialize EasyOCR: {e}")
        raise


@app.get("/")
def index():
    return {"status": "ok", "service": "easyocr"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/api/ocr")
async def ocr(image: UploadFile = File(...)):
    """Accept image via multipart form, return OCR text"""
    if not image.filename:
        return JSONResponse({"error": "No file provided"}, status_code=400)

    if ocr_reader is None:
        init_ocr()

    # Save uploaded file to temp
    ext = ".png"
    if image.filename:
        _, file_ext = os.path.splitext(image.filename)
        if file_ext:
            ext = file_ext.lower()
            if ext == ".jpeg":
                ext = ".jpg"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await image.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Run OCR
        result = ocr_reader.readtext(tmp_path)

        # Extract text from result
        lines = []
        total_confidence = 0.0
        count = 0

        for detection in result:
            if len(detection) >= 2:
                text = detection[1]
                confidence = detection[2] if len(detection) > 2 else 1.0
                if text:
                    lines.append(text)
                    total_confidence += confidence
                    count += 1

        full_text = "\n".join(lines)
        avg_confidence = (total_confidence / count * 100) if count > 0 else 0.0

        return {
            "text": full_text,
            "confidence": avg_confidence,
        }
    except Exception as e:
        print(f"OCR error: {e}")
        return JSONResponse({
            "text": f"OCR Error: {str(e)}",
            "confidence": 0.0,
        })
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EasyOCR HTTP Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()

    print(f"Starting EasyOCR server on {args.host}:{args.port}")
    print("Make sure to install dependencies: pip install easyocr fastapi uvicorn python-multipart")

    init_ocr()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")