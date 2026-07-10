#!/usr/bin/env python3
"""
Tesseract OCR HTTP Server
Run: python tesseract_server.py [--port 8080] [--tesseract "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"]

Requires: pip install flask werkzeug
"""

import argparse
import json
import subprocess
import tempfile
import os
from flask import Flask, request, jsonify

app = Flask(__name__)

DEFAULT_TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
DEFAULT_PORT = 8080


def extract_text_from_image(image_path: str, tesseract_cmd: str) -> tuple[str, float]:
    """Run tesseract and return (text, confidence)"""
    try:
        # Run tesseract with output to stdout, handle encoding issues
        # Use Chinese+English mode (-l chi_sim+eng)
        result = subprocess.run(
            [tesseract_cmd, image_path, "stdout", "-l", "chi_sim+eng", "--oem", "1", "--psm", "3"],
            capture_output=True,
            timeout=60,
        )

        # Try utf-8 first, fall back to latin-1 if needed
        try:
            text = result.stdout.decode("utf-8", errors="replace").strip()
        except Exception:
            text = result.stdout.decode("latin-1", errors="replace").strip()

        # Tesseract doesn't easily give confidence, estimate based on exit code
        confidence = 90.0 if result.returncode == 0 else 0.0

        return text, confidence
    except subprocess.TimeoutExpired:
        return "", 0.0
    except Exception as e:
        return f"Error: {e}", 0.0


@app.route("/", methods=["GET"])
def index():
    return jsonify({"status": "ok", "service": "tesseract-ocr"})


@app.route("/api/ocr", methods=["POST"])
def ocr():
    """Accept image via multipart form, return OCR text"""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    tesseract_cmd = request.form.get("tesseract", DEFAULT_TESSERACT)

    # Save uploaded file to temp
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        text, confidence = extract_text_from_image(tmp_path, tesseract_cmd)
        return jsonify({
            "text": text,
            "confidence": confidence,
        })
    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tesseract OCR HTTP Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on")
    parser.add_argument("--tesseract", type=str, default=DEFAULT_TESSERACT, help="Path to tesseract.exe")
    args = parser.parse_args()

    print(f"Starting Tesseract OCR server on port {args.port}")
    print(f"Using tesseract at: {args.tesseract}")

    app.run(host="0.0.0.0", port=args.port, debug=False)