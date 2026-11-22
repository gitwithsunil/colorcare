import unittest

from services.color_engine import (
    average_rgb, color_distance, estimate_color_name, hex_to_rgb,
    rgb_to_hex, rgb_to_hsl,
)


class ColorEngineTests(unittest.TestCase):
    def test_rgb_to_hex(self):
        self.assertEqual(rgb_to_hex((36, 91, 219)), "#245BDB")

    def test_hex_to_rgb(self):
        self.assertEqual(hex_to_rgb("#245BDB"), (36, 91, 219))
        self.assertEqual(hex_to_rgb("#abc"), (170, 187, 204))

    def test_rgb_to_hsl(self):
        self.assertEqual(rgb_to_hsl((255, 0, 0)), (0, 100, 50))

    def test_color_name_estimation(self):
        self.assertEqual(estimate_color_name((245, 205, 55)), "Yellow")
        self.assertEqual(estimate_color_name((0, 0, 0)), "Black")

    def test_color_distance(self):
        self.assertEqual(color_distance((10, 20, 30), (10, 20, 30)), 0)
        self.assertGreater(color_distance((255, 0, 0), (0, 0, 255)), 20)

    def test_average(self):
        self.assertEqual(average_rgb([(0, 10, 20), (10, 20, 30)]), (5, 15, 25))

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            rgb_to_hex((256, 0, 0))
        with self.assertRaises(ValueError):
            rgb_to_hex(None)
        with self.assertRaises(ValueError):
            hex_to_rgb("not-hex")
        with self.assertRaises(ValueError):
            hex_to_rgb(None)
        with self.assertRaises(ValueError):
            hex_to_rgb("##abcdef")
        with self.assertRaises(ValueError):
            average_rgb([])


if __name__ == "__main__":
    unittest.main()
