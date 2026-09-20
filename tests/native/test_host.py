import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('native_host', ROOT/'native'/'host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class HostTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.env = self.folder/'secrets.env'
        self.env.write_text("EUDIC_TOKEN='NIS fixture-token'\n")
        self.env.chmod(0o600)
        self.config = {'env_file':str(self.env), 'allowed_origins':['chrome-extension://'+'a'*32+'/']}
        self.patch = patch.dict(os.environ, {}, clear=True)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def test_status_never_returns_token(self):
        result=host.handle({'action':'status'},self.config)
        self.assertEqual(result,{'success':True,'configured':True,'source':'environment'})
        self.assertNotIn('fixture',json.dumps(result))

    def test_env_file_and_process_override(self):
        self.assertEqual(host.read_token(self.env),'NIS fixture-token')
        os.environ['EUDIC_TOKEN']='NIS override'
        self.assertEqual(host.read_token(self.env),'NIS override')

    def test_unsafe_permissions_and_symlink_rejected(self):
        self.env.chmod(0o644)
        with self.assertRaises(ValueError):host.read_token(self.env)
        self.env.chmod(0o600)
        link=self.folder/'link';link.symlink_to(self.env)
        with self.assertRaises(ValueError):host.read_token(link)

    def test_arbitrary_actions_do_not_read_credentials(self):
        result=host.handle({'action':'readFile','path':'/etc/passwd'},self.config)
        self.assertFalse(result['success'])

    def test_protocol_and_origin_validation(self):
        (self.folder/'host.py').write_text((ROOT/'native'/'host.py').read_text())
        (self.folder/'bridge.json').write_text(json.dumps(self.config))
        data=json.dumps({'action':'status'}).encode()
        message=struct.pack('=I',len(data))+data
        valid=self.config['allowed_origins'][0]
        for origin in [valid,'chrome-extension://'+'b'*32+'/']:
            result=subprocess.run([sys.executable,str(self.folder/'host.py'),origin],input=message,capture_output=True,check=True)
            self.assertEqual(result.stderr,b'')
            if origin!=valid:self.assertEqual(result.stdout,b'');continue
            length=struct.unpack('=I',result.stdout[:4])[0]
            self.assertEqual(len(result.stdout[4:]),length)
            self.assertTrue(json.loads(result.stdout[4:])['configured'])
            self.assertNotIn(b'fixture',result.stdout)

if __name__=='__main__':unittest.main()
