"""Color conversion, averaging, and perceptual name estimation."""
from math import sqrt

NAMED_COLORS = {
    "Black": (0, 0, 0), "White": (255, 255, 255), "Gray": (128, 128, 128),
    "Silver": (192, 192, 192), "Red": (220, 45, 55), "Crimson": (170, 25, 55),
    "Maroon": (128, 0, 32), "Coral": (240, 110, 90), "Orange": (244, 135, 35),
    "Peach": (250, 190, 155), "Yellow": (245, 205, 55), "Gold": (205, 160, 35),
    "Olive": (128, 128, 0), "Lime": (155, 205, 55), "Green": (50, 145, 80),
    "Mint": (125, 205, 175), "Teal": (35, 135, 135), "Cyan": (45, 190, 205),
    "Sky Blue": (90, 175, 220), "Blue": (45, 105, 210), "Ocean Blue": (25, 90, 155),
    "Navy": (25, 45, 100), "Indigo": (75, 55, 145), "Purple": (135, 75, 175),
    "Lavender": (180, 155, 220), "Magenta": (205, 50, 150), "Pink": (235, 130, 170),
    "Brown": (130, 85, 55), "Beige": (215, 195, 155), "Cream": (245, 235, 205),
}


def _rgb(rgb):
    try:
        rgb = tuple(rgb)
    except TypeError as exc:
        raise ValueError("RGB must contain three values from 0 to 255.") from exc
    if len(rgb) != 3 or any(not isinstance(v, (int, float)) or not 0 <= v <= 255 for v in rgb):
        raise ValueError("RGB must contain three values from 0 to 255.")
    return tuple(int(round(v)) for v in rgb)


def rgb_to_hex(rgb):
    return "#" + "".join(f"{v:02X}" for v in _rgb(rgb))


def hex_to_rgb(value):
    if not isinstance(value, str):
        raise ValueError("HEX must be a string containing three or six hexadecimal digits.")
    value = value.strip()
    if value.startswith("#"):
        value = value[1:]
    if "#" in value:
        raise ValueError("HEX contains invalid characters.")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        raise ValueError("HEX must have three or six hexadecimal digits.")
    try:
        return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError as exc:
        raise ValueError("HEX contains invalid characters.") from exc


def rgb_to_hsl(rgb):
    r, g, b = (v / 255 for v in _rgb(rgb))
    high, low = max(r, g, b), min(r, g, b)
    light = (high + low) / 2
    if high == low:
        hue = saturation = 0
    else:
        delta = high - low
        saturation = delta / (1 - abs(2 * light - 1))
        if high == r:
            hue = ((g - b) / delta) % 6
        elif high == g:
            hue = (b - r) / delta + 2
        else:
            hue = (r - g) / delta + 4
        hue *= 60
    return (round(hue), round(saturation * 100), round(light * 100))


def rgb_to_hsv(rgb):
    r, g, b = (v / 255 for v in _rgb(rgb))
    high, low = max(r, g, b), min(r, g, b)
    delta = high - low
    hue = 0 if delta == 0 else (60 * (((g - b) / delta) % 6) if high == r else 60 * ((b - r) / delta + 2) if high == g else 60 * ((r - g) / delta + 4))
    return (round(hue), round(0 if high == 0 else delta / high * 100), round(high * 100))


def _lab(rgb):
    # sRGB -> CIELAB (D65), for perceptually better nearest named-color matching.
    linear = []
    for v in _rgb(rgb):
        c = v / 255
        linear.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    r, g, b = linear
    x = (0.4124*r + 0.3576*g + 0.1805*b) / 0.95047
    y = 0.2126*r + 0.7152*g + 0.0722*b
    z = (0.0193*r + 0.1192*g + 0.9505*b) / 1.08883
    f = lambda t: t ** (1/3) if t > 0.008856 else 7.787*t + 16/116
    fx, fy, fz = f(x), f(y), f(z)
    return (116*fy - 16, 500*(fx-fy), 200*(fy-fz))


def color_distance(rgb_a, rgb_b):
    return sqrt(sum((a-b) ** 2 for a, b in zip(_lab(rgb_a), _lab(rgb_b))))


def estimate_color_name(rgb):
    rgb = _rgb(rgb)
    return min(NAMED_COLORS, key=lambda name: color_distance(rgb, NAMED_COLORS[name]))


def average_rgb(pixels):
    values = list(pixels)
    if not values:
        raise ValueError("At least one pixel is required.")
    return tuple(round(sum(_rgb(p)[i] for p in values) / len(values)) for i in range(3))


def describe_rgb(rgb):
    rgb = _rgb(rgb)
    h, s, l = rgb_to_hsl(rgb)
    return {"name": estimate_color_name(rgb), "hex": rgb_to_hex(rgb), "rgb": list(rgb), "hsl": [h, s, l]}
