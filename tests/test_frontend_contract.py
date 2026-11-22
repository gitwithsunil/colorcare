import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "static" / "js" / "app.js").read_text(encoding="utf-8")


class FrontendContractTests(unittest.TestCase):
    def test_ids_are_unique(self):
        ids = re.findall(r'\bid="([^"]+)"', HTML)
        duplicates = sorted({value for value in ids if ids.count(value) > 1})
        self.assertEqual(duplicates, [])

    def test_direct_script_selectors_exist(self):
        html_ids = set(re.findall(r'\bid="([^"]+)"', HTML))
        script_created_ids = set(re.findall(r"\.id\s*=\s*['\"]([\w-]+)['\"]", JS))
        selectors = set(re.findall(r"\$\('#([\w-]+)'\)", JS))
        self.assertEqual(sorted(selectors - html_ids - script_created_ids), [])

    def test_navigation_targets_have_views(self):
        targets = set(re.findall(r'data-view="([\w-]+)"', HTML))
        view_ids = set(re.findall(r'<section class="view(?: active)?" id="view-([\w-]+)"', HTML))
        self.assertTrue(targets)
        self.assertEqual(sorted(targets - view_ids), [])


if __name__ == "__main__":
    unittest.main()
