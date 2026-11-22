"""Small image helpers used by upload analysis."""
import base64
from io import BytesIO

from PIL import Image

from services.color_engine import describe_rgb


def extract_palette(image, count=6):
    working = image.convert("RGB")
    working.thumbnail((240, 240))
    quantized = working.quantize(colors=count, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette()
    results = []
    for population, index in quantized.getcolors(240 * 240) or []:
        rgb = tuple(palette[index * 3:index * 3 + 3])
        item = describe_rgb(rgb)
        item["percent"] = round(population * 100 / (working.width * working.height), 1)
        results.append(item)
    return sorted(results, key=lambda item: item["percent"], reverse=True)[:count]


def image_to_data_url(image, max_side=1200):
    image = image.convert("RGB")
    image.thumbnail((max_side, max_side))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=82, optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return "data:image/jpeg;base64," + encoded
