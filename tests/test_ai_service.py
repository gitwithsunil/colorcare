import base64
import io
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from PIL import Image

from services.ai_service import AIService


class AIServiceTests(unittest.TestCase):
    def test_unconfigured_service_does_not_fake_a_reply(self):
        service = AIService()
        service.client = None
        self.assertFalse(service.available)
        with self.assertRaisesRegex(RuntimeError, "not configured"):
            service.ask("What color is this?")

    def test_interactions_payload_supports_text_and_image(self):
        service = AIService()
        service.client = Mock()
        service.client.interactions.create.return_value = SimpleNamespace(output_text="A blue mug.")
        image = Image.new("RGB", (3, 2), (36, 91, 219))

        answer = service.ask("Describe this", history=[{"role": "user", "content": "Previous question"}], image=image)

        self.assertEqual(answer, "A blue mug.")
        kwargs = service.client.interactions.create.call_args.kwargs
        self.assertEqual(kwargs["model"], service.model)
        self.assertEqual(kwargs["generation_config"], {"thinking_level": "minimal", "max_output_tokens": 256})
        self.assertFalse(kwargs["store"])
        self.assertFalse(kwargs["automatic_continuation"])
        self.assertEqual(kwargs["timeout"], 25)
        self.assertIn("Previous question", kwargs["input"][0]["text"])
        image_part = kwargs["input"][1]
        self.assertEqual((image_part["type"], image_part["mime_type"]), ("image", "image/jpeg"))
        decoded = base64.b64decode(image_part["data"])
        self.assertEqual(Image.open(io.BytesIO(decoded)).size, (3, 2))

    def test_streaming_yields_text_deltas(self):
        service = AIService()
        service.client = Mock()
        service.client.interactions.create.return_value = [
            SimpleNamespace(event_type="step.delta", delta=SimpleNamespace(type="text", text="A blue ")),
            SimpleNamespace(event_type="step.delta", delta=SimpleNamespace(type="thought_summary", text="ignored")),
            SimpleNamespace(event_type="step.delta", delta=SimpleNamespace(type="text", text="mug.")),
        ]

        self.assertEqual(list(service.ask_stream("What is this?")), ["A blue ", "mug."])
        kwargs = service.client.interactions.create.call_args.kwargs
        self.assertTrue(kwargs["stream"])
        self.assertEqual(kwargs["generation_config"]["thinking_level"], "minimal")

    def test_decode_data_url(self):
        buffer = io.BytesIO()
        Image.new("RGB", (2, 2), "red").save(buffer, format="PNG")
        data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        decoded = AIService.decode_data_url(data_url)
        self.assertEqual(decoded.getpixel((0, 0)), (255, 0, 0))
        with self.assertRaises(ValueError):
            AIService.decode_data_url("not-an-image")


if __name__ == "__main__":
    unittest.main()
