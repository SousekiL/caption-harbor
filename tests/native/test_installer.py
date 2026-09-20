import importlib.util
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('installer',Path(__file__).resolve().parents[2]/'scripts/install-native-host.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
class InstallerTest(unittest.TestCase):
    def test_browseros_detected_without_assuming_chrome(self):
        with tempfile.TemporaryDirectory() as folder:
            expected=Path(folder)/'Library/Application Support/BrowserOS';expected.mkdir(parents=True)
            self.assertEqual(installer.browser_profile('auto',folder,'darwin'),expected)
    def test_explicit_browser_wins(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(installer.browser_profile('browseros-neo',folder,'darwin'),Path(folder)/'Library/Application Support/BrowserClaw')
    def test_no_profile_does_not_guess(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):installer.browser_profile('auto',folder,'darwin')
