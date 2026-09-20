import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess
spec=importlib.util.spec_from_file_location('audio_worker',Path(__file__).resolve().parents[2]/'native/audio_worker.py')
audio=importlib.util.module_from_spec(spec);spec.loader.exec_module(audio)
class AudioTest(unittest.TestCase):
    def test_invalid_video_cannot_start_process(self):
        with tempfile.TemporaryDirectory() as d, patch.object(audio.subprocess,'Popen') as spawn:
            self.assertFalse(audio.handle({'action':'audioStart','videoId':'https://example.com','provider':'groq'},Path(d))['success']);spawn.assert_not_called()
    def test_missing_tools_give_actionable_result(self):
        with tempfile.TemporaryDirectory() as d, patch.object(audio,'tool',return_value=None):
            result=audio.handle({'action':'audioStart','videoId':'video123','provider':'local'},Path(d));self.assertFalse(result['success']);self.assertIn('yt-dlp',result['error'])
    def test_job_paths_reject_traversal(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):audio.job_path(Path(d),'../secrets.env')
    def test_groq_request_is_timestamped_and_key_is_not_persisted(self):
        with tempfile.TemporaryDirectory() as d:
            job=Path(d)/'audio-jobs'/('a'*32);job.mkdir(parents=True)
            def fake_command(args,timeout):
                if 'yt-dlp' in args[0]:(job/'input.webm').write_bytes(b'audio')
                else:(job/'part-0000.wav').write_bytes(b'RIFF fixture')
            def respond(request,timeout):
                self.assertEqual(request.full_url,'https://api.groq.com/openai/v1/audio/transcriptions')
                self.assertEqual(request.get_header('Authorization'),'Bearer fixture-groq')
                self.assertIn(b'verbose_json',request.data)
                return io.BytesIO(json.dumps({'segments':[{'start':.5,'end':2,'text':'hello'}]}).encode())
            with patch.object(audio,'tool',side_effect=lambda name:name),patch.object(audio,'command',side_effect=fake_command),patch.object(audio.urllib.request,'urlopen',side_effect=respond):
                audio.run(job,{'videoId':'video123','provider':'groq','groqModel':'whisper-large-v3-turbo','apiKey':'fixture-groq'})
            data=json.loads((job/'state.json').read_text());self.assertEqual(data['content'][0]['offset'],500)
            self.assertFalse(any(b'fixture-groq' in p.read_bytes() for p in job.iterdir()))

    def test_uses_downloaded_english_captions_when_optional_tracks_fail(self):
        with tempfile.TemporaryDirectory() as d:
            job=Path(d)/'audio-jobs'/('b'*32);job.mkdir(parents=True)
            captions={
                'events':[
                    {
                        'tStartMs':1000,
                        'dDurationMs':2200,
                        'segs':[
                            {'utf8':'Existing'},
                            {'utf8':' English','tOffsetMs':700},
                            {'utf8':' captions.','tOffsetMs':1500},
                        ],
                    },
                ]
            }
            def partial_download(args,stdin,stdout,stderr,timeout):
                (job/'captions.en.json3').write_text(json.dumps(captions))
                return subprocess.CompletedProcess(args,1)
            with patch.object(audio,'tool',return_value='yt-dlp'),patch.object(audio.subprocess,'run',side_effect=partial_download):
                audio.run(job,{'videoId':'video123','provider':'captions','model':'small.en'})
            state=json.loads((job/'state.json').read_text())
            self.assertEqual(state['status'],'completed')
            self.assertEqual(
                [(item['offset'],item['text']) for item in state['content']],
                [(1000,'Existing'),(1700,'English'),(2500,'captions.')],
            )
