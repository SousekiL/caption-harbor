import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('sync_local', ROOT/'scripts/sync-local-extension.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class SyncTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.source=self.root/'source';self.target=self.root/'installed'
        self.source.mkdir();self.target.mkdir()
        for folder,version in [(self.source,'2.1.9'),(self.target,'2.1.5')]:
            (folder/'manifest.json').write_text(json.dumps({'name':'Caption Harbor','manifest_version':3,'version':version}))
        (self.source/'app.js').write_text('new code')
        (self.target/'app.js').write_text('old code')
        (self.target/'personal.txt').write_text('untouched')
        self.files=['manifest.json','app.js']
    def tearDown(self):self.temp.cleanup()
    def test_sync_preserves_directory_and_unlisted_files_and_backs_up(self):
        result=sync.synchronize(self.source,self.target,self.files,self.root/'backups')
        self.assertEqual(result['changed_files'],2)
        self.assertEqual((self.target/'app.js').read_text(),'new code')
        self.assertEqual((self.target/'personal.txt').read_text(),'untouched')
        self.assertEqual((Path(result['backup'])/'app.js').read_text(),'old code')
        self.assertEqual(sync.synchronize(self.source,self.target,self.files,self.root/'backups')['changed_files'],0)
    def test_dry_run_leaves_files_untouched(self):
        sync.synchronize(self.source,self.target,self.files,self.root/'backups',True)
        self.assertEqual((self.target/'app.js').read_text(),'old code')
        self.assertFalse((self.root/'backups').exists())
    def test_wrong_app_identity_and_symlinks_are_rejected(self):
        manifest=json.loads((self.target/'manifest.json').read_text());manifest['key']='different-key'
        (self.target/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):sync.synchronize(self.source,self.target,self.files,self.root/'backups')
        manifest.pop('key');(self.target/'manifest.json').write_text(json.dumps(manifest))
        (self.target/'app.js').unlink();(self.target/'app.js').symlink_to(self.target/'personal.txt')
        with self.assertRaises(ValueError):sync.synchronize(self.source,self.target,self.files,self.root/'backups')
        self.assertEqual((self.target/'personal.txt').read_text(),'untouched')

if __name__=='__main__':unittest.main()
