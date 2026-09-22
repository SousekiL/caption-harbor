import importlib.util
from pathlib import Path
import tempfile
import unittest
import json
import os
import stat
import struct
import subprocess
import sys
spec=importlib.util.spec_from_file_location('installer',Path(__file__).resolve().parents[2]/'scripts/install-native-host.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
class InstallerTest(unittest.TestCase):
    def test_isolated_install_runs_audio_protocol_and_preserves_existing_secret(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);config=root/'private helper';profile=root/'browser profile'
            script=Path(__file__).resolve().parents[2]/'scripts/install-native-host.py'
            def install(identifier):
                return subprocess.run([sys.executable,str(script),'--extension-id',identifier,'--config-dir',str(config),'--profile-dir',str(profile)],capture_output=True,check=True)
            first=install('a'*32)
            self.assertEqual(first.stderr,b'')
            secret=config/'secrets.env';secret.write_text('EUDIC_TOKEN=fixture-existing-secret\n')
            install('b'*32)
            self.assertEqual(secret.read_text(),'EUDIC_TOKEN=fixture-existing-secret\n')
            self.assertEqual(stat.S_IMODE(secret.stat().st_mode),0o600)
            self.assertEqual(stat.S_IMODE(config.stat().st_mode),0o700)
            manifest=json.loads((profile/'NativeMessagingHosts'/f'{installer.HOST}.json').read_text())
            self.assertEqual(set(manifest['allowed_origins']),{'chrome-extension://'+'a'*32+'/','chrome-extension://'+'b'*32+'/'})
            data=json.dumps({'action':'audioStatus'}).encode()
            framed=struct.pack('=I',len(data))+data
            environment={key:value for key,value in os.environ.items() if key!='EUDIC_TOKEN'}
            response=subprocess.run([manifest['path'],manifest['allowed_origins'][0]],input=framed,capture_output=True,check=True,env=environment)
            self.assertEqual(response.stderr,b'')
            self.assertEqual(struct.unpack('=I',response.stdout[:4])[0],len(response.stdout[4:]))
            result=json.loads(response.stdout[4:]);self.assertTrue(result['success'])
            self.assertIn('ffmpeg',result);self.assertNotIn(b'fixture-existing-secret',response.stdout)

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
