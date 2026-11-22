import io
import unittest
from unittest.mock import Mock, PropertyMock, patch

from PIL import Image

import app as colorcare_app


class AppRouteTests(unittest.TestCase):
    def setUp(self):
        colorcare_app.app.config["TESTING"] = True
        self.client = colorcare_app.app.test_client()

    def png(self, color=(36, 91, 219)):
        image = Image.new("RGB", (4, 3), color)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer

    def test_home_and_status(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"See colors.", response.data)
        self.assertEqual(self.client.get("/api/status").json["ai_available"], colorcare_app.ai_service.available)

    def test_missing_ai_key_fallback(self):
        with patch.object(type(colorcare_app.ai_service), "available", new_callable=PropertyMock, return_value=False):
            response = self.client.post("/api/chat", json={"message": "Describe this blue"})
            self.assertEqual(response.status_code, 503)
            self.assertIn("Local color detection is still available", response.json["error"])

            response = self.client.post("/api/analyze-image", data={
                "image": (self.png(), "color.png"), "describe": "true",
            }, content_type="multipart/form-data")
            self.assertEqual(response.status_code, 200)
            self.assertIn("AI assistance is not configured", response.json["ai_error"])
            self.assertEqual(response.json["palette"][0]["hex"], "#245BDB")

    def test_image_validation_and_palette(self):
        response = self.client.post("/api/analyze-image", data={
            "image": (self.png(), "sample.png"),
        }, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json["width"], response.json["height"]), (4, 3))
        self.assertEqual(response.json["palette"][0]["hex"], "#245BDB")

        response = self.client.post("/api/analyze-image", data={
            "image": (self.png(), "sample.exe"),
        }, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post("/api/analyze-image").status_code, 400)

    def test_oversized_dimensions_are_rejected_before_decode(self):
        oversized = Mock(width=5001, height=5000)
        with patch("app.Image.open", return_value=oversized):
            with self.assertRaisesRegex(ValueError, "24 megapixels"):
                colorcare_app.read_image(type("Upload", (), {"filename": "large.png", "read": lambda self: b"png"})())
        oversized.load.assert_not_called()

    def test_chat_validation_when_ai_is_available(self):
        with patch.object(type(colorcare_app.ai_service), "available", new_callable=PropertyMock, return_value=True):
            self.assertEqual(self.client.post("/api/chat", json=["not", "an object"]).status_code, 400)
            self.assertEqual(self.client.post("/api/chat", json={"message": "  "}).status_code, 400)
            self.assertEqual(self.client.post("/api/chat", json={"message": "x" * 2001}).status_code, 400)
            self.assertEqual(self.client.post("/api/chat", json={"message": "hello", "history": "bad"}).status_code, 400)
            self.assertEqual(self.client.post("/api/chat", json={"message": "hello", "history": [{"role": "system", "content": "x"}]}).status_code, 400)

    def test_chat_stream_returns_server_sent_events(self):
        with patch.object(type(colorcare_app.ai_service), "available", new_callable=PropertyMock, return_value=True), \
                patch.object(colorcare_app.ai_service, "ask_stream", return_value=iter(["A blue ", "mug."])):
            response = self.client.post("/api/chat", json={"message": "What is this?", "stream": True})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.mimetype.startswith("text/event-stream"))
            self.assertIn('"text": "A blue "', response.get_data(as_text=True))
            self.assertIn('"text": "mug."', response.get_data(as_text=True))
            self.assertIn("[DONE]", response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
