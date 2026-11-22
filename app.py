"""ColorCare AI local Flask application."""
import os
import json
from io import BytesIO

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request, stream_with_context
from PIL import Image, UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge

from services.ai_service import AIService, GeminiAPIError
from services.image_service import extract_palette

load_dotenv()
app = Flask(__name__)
# JSON image attachments are base64 encoded (about 4/3 the source size).
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024
app.config["JSON_SORT_KEYS"] = False
ai_service = AIService()
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


def read_image(file_storage):
    name = (file_storage.filename or "").lower()
    if "." not in name or name.rsplit(".", 1)[1] not in ALLOWED_EXTENSIONS:
        raise ValueError("Choose a JPG, PNG, or WEBP image.")
    raw = file_storage.read()
    if not raw:
        raise ValueError("The selected image is empty.")
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("That image is over the 8 MB upload limit.")
    try:
        image = Image.open(BytesIO(raw))
        if image.width * image.height > 24_000_000:
            raise ValueError("This image is too large to process. Choose one under 24 megapixels.")
        image.load()
        image = image.convert("RGB")
    except ValueError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValueError("That file could not be opened as an image.")
    return image


@app.get("/")
def home():
    return render_template("index.html", ai_configured=ai_service.available)


@app.get("/api/status")
def status():
    return jsonify({"ai_available": ai_service.available})


@app.post("/api/analyze-image")
def analyze_image():
    uploaded = request.files.get("image")
    if not uploaded:
        return jsonify({"error": "Choose an image to analyze."}), 400
    try:
        image = read_image(uploaded)
        palette = extract_palette(image, 6)
        result = {"width": image.width, "height": image.height, "palette": palette}
        if request.form.get("describe") == "true" and ai_service.available:
            result["description"] = ai_service.describe_image(image)
        elif request.form.get("describe") == "true":
            result["ai_error"] = "AI assistance is not configured. Local color detection is still available."
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Image analysis failed")
        return jsonify({"error": "The image could not be analyzed. Please try another image."}), 500


@app.post("/api/chat")
def chat():
    if not ai_service.available:
        return jsonify({"error": "AI assistance is not configured. Local color detection is still available."}), 503
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Send chat details as a JSON object."}), 400
    raw_message = data.get("message", "")
    if not isinstance(raw_message, str):
        return jsonify({"error": "Enter a text message."}), 400
    message = raw_message.strip()
    if not message:
        return jsonify({"error": "Enter a message first."}), 400
    if len(message) > 2000:
        return jsonify({"error": "Keep messages under 2,000 characters."}), 400
    history = data.get("history", [])
    if not isinstance(history, list) or len(history) > 8:
        return jsonify({"error": "Chat history must contain at most 8 recent messages."}), 400
    for item in history:
        if (not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}
                or not isinstance(item.get("content"), str) or len(item["content"]) > 1000):
            return jsonify({"error": "One of the recent chat messages is invalid."}), 400
    try:
        image = None
        if data.get("image"):
            image = ai_service.decode_data_url(data["image"])
        if data.get("stream") is True:
            def stream_reply():
                try:
                    for chunk in ai_service.ask_stream(message, history, image):
                        yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                except TimeoutError as exc:
                    app.logger.warning("Gemini response timed out: %s", exc)
                    yield f"data: {json.dumps({'error': str(exc)})}\n\n"
                except GeminiAPIError as exc:
                    app.logger.warning("Gemini API rejected the chat request: %s", exc)
                    yield f"data: {json.dumps({'error': str(exc)})}\n\n"
                except Exception:
                    app.logger.exception("Streaming AI request failed")
                    yield f"data: {json.dumps({'error': 'ColorCare could not reach the AI service. Please try again.'})}\n\n"

            return Response(stream_with_context(stream_reply()), mimetype="text/event-stream", headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            })
        answer = ai_service.ask(message, history, image)
        return jsonify({"reply": answer})
    except TimeoutError:
        return jsonify({"error": "Gemini took too long to respond. Please try again."}), 504
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("AI request failed")
        return jsonify({"error": "ColorCare could not reach the AI service. Please try again."}), 502


@app.errorhandler(RequestEntityTooLarge)
def too_large(_error):
    return jsonify({"error": "This request is too large. Keep images under 8 MB."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
