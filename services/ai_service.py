"""Optional Gemini integration. Local features do not depend on this service."""
import base64
from io import BytesIO
import json
import os
import queue
import threading
import time
from urllib.parse import quote

from PIL import Image
import requests


class GeminiAPIError(RuntimeError):
    """Safe, user-facing Gemini API error without response secrets."""

class AIService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self.client = None
        self.types = None
        self.first_chunk_timeout = max(10, float(os.getenv("GEMINI_FIRST_TOKEN_TIMEOUT_SECONDS", "80")))
        self._stream_slots = threading.BoundedSemaphore(2)
        if self.api_key:
            try:
                from google import genai
                from google.genai import types

                # The SDK retries transient failures several times by default.
                # When the API is unreachable, that can leave the UI waiting for
                # minutes. Use one bounded attempt so the app fails promptly.
                self.client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(
                        timeout=int(os.getenv("GEMINI_HTTP_TIMEOUT_MS", "90000")),
                        retry_options=types.HttpRetryOptions(attempts=1),
                    ),
                )
                self.types = types
            except ImportError:
                self.client = None

    @property
    def available(self):
        return self.client is not None

    @staticmethod
    def decode_data_url(data_url):
        if not isinstance(data_url, str) or not data_url.startswith("data:image/") or "," not in data_url:
            raise ValueError("Attach a valid image to your message.")
        try:
            raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        except Exception as exc:
            raise ValueError("That image could not be read.") from exc

    def _build_contents(self, prompt, image=None):
        contents = [prompt]
        if image is not None:
            buffer = BytesIO()
            image.save(buffer, format="JPEG", quality=82, optimize=True)
            contents.append(self.types.Part.from_bytes(data=buffer.getvalue(), mime_type="image/jpeg"))
        return contents

    @staticmethod
    def _build_rest_parts(prompt, image=None):
        parts = [{"text": prompt}]
        if image is not None:
            buffer = BytesIO()
            image.save(buffer, format="JPEG", quality=82, optimize=True)
            parts.append({"inlineData": {
                "mimeType": "image/jpeg",
                "data": base64.b64encode(buffer.getvalue()).decode("ascii"),
            }})
        return parts

    @staticmethod
    def _safe_api_error(status_code):
        if status_code == 429:
            return "Gemini rate limit reached (HTTP 429). Check AI Studio limits or wait for reset."
        if status_code == 402:
            return "Gemini requires billing or available prepay credit (HTTP 402)."
        if status_code == 403:
            return "Gemini denied access (HTTP 403). Check the API key's project and permissions."
        if status_code == 400:
            return "Gemini rejected the request (HTTP 400). Check the model and request settings."
        return f"Gemini returned HTTP {status_code}. Please try again later."

    def _generation_config(self):
        return self.types.GenerateContentConfig(
            system_instruction="You are ColorCare, an accessible color and visual assistant. Reply briefly and clearly. Do not diagnose medical conditions.",
            max_output_tokens=128,
            thinking_config=self.types.ThinkingConfig(thinking_level="minimal"),
        )
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError("That image is over the 8 MB upload limit.")
        try:
            image = Image.open(BytesIO(raw))
            if image.width * image.height > 24_000_000:
                raise ValueError("This image is too large to process. Choose one under 24 megapixels.")
            image.load()
            image = image.convert("RGB")
            image.thumbnail((1200, 1200))
            return image
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("That image could not be read.") from exc

    def ask(self, message, history=None, image=None):
        if not self.available:
            raise RuntimeError("Gemini is not configured.")
        prompt = ""
        for item in (history or [])[-4:]:
            role = "User" if item.get("role") == "user" else "ColorCare"
            prompt += f"{role}: {str(item.get('content', ''))[:600]}\n"
        prompt += f"User: {message}"
        response = self.client.models.generate_content(
            model=self.model,
            contents=self._build_contents(prompt, image),
            config=self._generation_config(),
        )
        return (response.text or "I couldn't form a response just now. Please try again.").strip()

    def ask_stream(self, message, history=None, image=None):
        """Yield text deltas as Gemini generates them for a responsive chat UI."""
        if not self.available:
            raise RuntimeError("Gemini is not configured.")
        prompt = ""
        for item in (history or [])[-4:]:
            role = "User" if item.get("role") == "user" else "ColorCare"
            prompt += f"{role}: {str(item.get('content', ''))[:600]}\n"
        prompt += f"User: {message}"
        request_body = {
            "systemInstruction": {"parts": [{"text": "You are ColorCare, an accessible color and visual assistant. Reply briefly and clearly. Do not diagnose medical conditions."}]},
            "contents": [{"role": "user", "parts": self._build_rest_parts(prompt, image)}],
            "generationConfig": {"maxOutputTokens": 128},
        }
        stream_url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(self.model, safe='')}:streamGenerateContent"

        event_queue = queue.Queue()
        stop_stream = threading.Event()
        if not self._stream_slots.acquire(blocking=False):
            raise RuntimeError("The AI assistant is busy. Please try again in a moment.")

        def fetch_events():
            response = None
            try:
                response = requests.post(
                    stream_url,
                    params={"alt": "sse"},
                    headers={"x-goog-api-key": self.api_key},
                    json=request_body,
                    stream=True,
                    timeout=(10, 90),
                )
                if response.status_code != 200:
                    raise GeminiAPIError(self._safe_api_error(response.status_code))
                for line in response.iter_lines(decode_unicode=True):
                    if stop_stream.is_set():
                        break
                    if not line or not line.startswith("data:"):
                        continue
                    try:
                        payload = json.loads(line[5:].strip())
                    except (TypeError, ValueError):
                        continue
                    for candidate in payload.get("candidates", []):
                        for part in candidate.get("content", {}).get("parts", []):
                            text = part.get("text") if isinstance(part, dict) else None
                            if text:
                                event_queue.put(("text", text))
            except Exception as exc:
                event_queue.put(("error", exc))
            finally:
                if response is not None:
                    response.close()
                event_queue.put(("done", None))
                self._stream_slots.release()

        threading.Thread(target=fetch_events, name="colorcare-gemini-stream", daemon=True).start()
        emitted = False
        started = time.monotonic()
        deadline = started + self.first_chunk_timeout
        total_deadline = started + max(self.first_chunk_timeout + 30, 120)
        while True:
            remaining = min(deadline, total_deadline) - time.monotonic()
            if remaining <= 0:
                stop_stream.set()
                if not emitted:
                    raise TimeoutError(f"Gemini did not start a reply within {self.first_chunk_timeout:g} seconds. Check API access and try again.")
                raise TimeoutError("Gemini stopped responding. Please try again.")
            try:
                kind, value = event_queue.get(timeout=remaining)
            except queue.Empty:
                stop_stream.set()
                if not emitted:
                    raise TimeoutError(f"Gemini did not start a reply within {self.first_chunk_timeout:g} seconds. Check API access and try again.")
                raise TimeoutError("Gemini stopped responding. Please try again.")
            if kind == "text":
                emitted = True
                deadline = min(time.monotonic() + 20, total_deadline)
                yield value
            elif kind == "error":
                stop_stream.set()
                cause = value
                while cause is not None:
                    if isinstance(cause, TimeoutError):
                        raise TimeoutError("Gemini is taking too long to respond. Please try again.") from value
                    cause = cause.__cause__
                raise value
            else:
                break
        if not emitted:
            yield "I couldn't form a response just now. Please try again."

    def describe_image(self, image):
        return self.ask("Describe the main objects and visible colors in this image in a few simple sentences.", image=image)
