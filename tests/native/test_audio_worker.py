import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess
import struct
import wave

def write_wav(path, seconds=1, metadata=False):
    with wave.open(str(path),'wb') as output:
        output.setnchannels(1);output.setsampwidth(2);output.setframerate(16000)
        output.writeframes(b'\x00\x00' * int(seconds*16000))
    if metadata:
        data=path.read_bytes()
        extra=b'JUNK'+struct.pack('<I',100)+b'x'*100
        path.write_bytes(data[:4]+struct.pack('<I',len(data)+len(extra)-8)+data[8:12]+extra+data[12:])
spec=importlib.util.spec_from_file_location('audio_worker',Path(__file__).resolve().parents[2]/'native/audio_worker.py')
audio=importlib.util.module_from_spec(spec);spec.loader.exec_module(audio)
class AudioTest(unittest.TestCase):
    def test_invalid_start_parameters_are_rejected_before_spawning(self):
        invalid=[{'videoId':None},{'videoId':123},{'apiKey':''},{'apiKey':'  '},{'apiKey':'bad\nheader'},
                 {'groqModel':'unsupported'},{'url':42}]
        for overrides in invalid:
            with self.subTest(overrides=overrides),tempfile.TemporaryDirectory() as d,patch.object(audio,'tool',side_effect=lambda name:name),patch.object(audio.subprocess,'Popen') as spawn:
                spawn.return_value.pid=4242
                request={'action':'audioStart','videoId':'video123','provider':'groq','apiKey':'fixture',**overrides}
                result=audio.handle(request,Path(d))
                self.assertFalse(result['success']);spawn.assert_not_called()

    def test_fast_worker_completion_is_not_overwritten_by_start(self):
        with tempfile.TemporaryDirectory() as d, patch.object(audio,'tool',side_effect=lambda name:name),patch.object(audio.subprocess,'Popen') as spawn:
            spawn.return_value.pid=4242
            def finish():
                job=next((Path(d)/'audio-jobs').iterdir())
                audio.write_state(job,{'status':'completed','content':[{'offset':0,'duration':1,'text':'done'}]})
            spawn.return_value.stdin.close.side_effect=finish
            started=audio.handle({'action':'audioStart','videoId':'video123','provider':'groq','apiKey':'fixture'},Path(d))
            state=audio.handle({'action':'audioPoll','jobId':started['jobId']},Path(d))
            self.assertEqual(state['status'],'completed')

    def test_spawn_failure_does_not_leave_active_job(self):
        with tempfile.TemporaryDirectory() as d, patch.object(audio,'tool',side_effect=lambda name:name),patch.object(audio.subprocess,'Popen',side_effect=OSError('fixture failure')):
            result=audio.handle({'action':'audioStart','videoId':'video123','provider':'groq','apiKey':'fixture'},Path(d))
            self.assertFalse(result['success'])
            self.assertEqual(list((Path(d)/'audio-jobs').iterdir()),[])

    def test_expired_job_poll_is_terminal(self):
        with tempfile.TemporaryDirectory() as d:
            job=Path(d)/'audio-jobs'/('a'*32);job.mkdir(parents=True)
            audio.write_state(job,{'status':'working','updated':0})
            result=audio.handle({'action':'audioPoll','jobId':job.name},Path(d))
            self.assertTrue(result['success'])
            self.assertEqual(result['status'],'failed')

    def test_groq_chunk_offsets_ignore_wav_metadata(self):
        with tempfile.TemporaryDirectory() as d:
            job=Path(d)/'audio-jobs'/('a'*32);job.mkdir(parents=True)
            def fake_command(args,timeout):
                if 'yt-dlp' in args[0]:(job/'input.webm').write_bytes(b'audio')
                else:
                    write_wav(job/'part-0000.wav',seconds=1,metadata=True)
                    write_wav(job/'part-0001.wav',seconds=1)
            def respond(request,timeout):
                return io.BytesIO(json.dumps({'segments':[{'start':0,'end':1,'text':'hello'}]}).encode())
            with patch.object(audio,'tool',side_effect=lambda name:name),patch.object(audio,'command',side_effect=fake_command),patch.object(audio.urllib.request,'urlopen',side_effect=respond):
                audio.run(job,{'videoId':'video123','provider':'groq','groqModel':'whisper-large-v3-turbo','apiKey':'fixture'})
            content=json.loads((job/'state.json').read_text())['content']
            self.assertEqual([x['offset'] for x in content],[0,1000])

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
                else:write_wav(job/'part-0000.wav')
            def respond(request,timeout):
                self.assertEqual(request.full_url,'https://api.groq.com/openai/v1/audio/transcriptions')
                self.assertEqual(request.get_header('Authorization'),'Bearer fixture-groq')
                self.assertIn(b'verbose_json',request.data)
                return io.BytesIO(json.dumps({'segments':[{'start':.5,'end':2,'text':'hello'}]}).encode())
            with patch.object(audio,'tool',side_effect=lambda name:name),patch.object(audio,'command',side_effect=fake_command),patch.object(audio.urllib.request,'urlopen',side_effect=respond):
                audio.run(job,{'videoId':'video123','provider':'groq','groqModel':'whisper-large-v3-turbo','apiKey':'fixture-groq'})
            data=json.loads((job/'state.json').read_text());self.assertEqual(data['content'][0]['offset'],500)
            self.assertFalse(any(b'fixture-groq' in p.read_bytes() for p in job.iterdir()))

    def test_audio_resolve_returns_the_content_addressed_rendition(self):
        with tempfile.TemporaryDirectory() as d:
            class Redirect:
                def __enter__(self):return self
                def __exit__(self,*a):return False
                def geturl(self):return 'https://cdn.example/rendition_123.mp3'
            with patch.object(audio.urllib.request,'urlopen',return_value=Redirect()):
                result=audio.handle({'action':'audioResolve','url':'https://feed.example/ep.mp3'},Path(d))
            self.assertEqual(result['url'],'https://cdn.example/rendition_123.mp3')
            self.assertFalse(audio.handle({'action':'audioResolve','url':'http://insecure.example/ep.mp3'},Path(d))['success'])

    def test_groq_job_downloads_and_records_the_pinned_rendition(self):
        with tempfile.TemporaryDirectory() as d:
            job=Path(d)/'audio-jobs'/('c'*32);job.mkdir(parents=True)
            def fake_command(args,timeout):
                if 'yt-dlp' in args[0]:
                    self.assertIn('https://cdn.example/rendition.mp3',args)
                    (job/'input.webm').write_bytes(b'audio')
                else:write_wav(job/'part-0000.wav')
            def respond(request,timeout=0):
                if 'groq.com' in request.full_url:
                    return io.BytesIO(json.dumps({'segments':[{'start':0,'end':1,'text':'hi'}]}).encode())
                class Redirect:
                    def __enter__(self):return self
                    def __exit__(self,*a):return False
                    def geturl(self):return 'https://cdn.example/rendition.mp3'
                return Redirect()
            with patch.object(audio,'tool',side_effect=lambda name:name),patch.object(audio,'command',side_effect=fake_command),patch.object(audio.urllib.request,'urlopen',side_effect=respond):
                audio.run(job,{'videoId':'apple_1_2','provider':'groq','groqModel':'whisper-large-v3-turbo','apiKey':'fixture','url':'https://feed.example/ep.mp3'})
            data=json.loads((job/'state.json').read_text())
            self.assertEqual(data['sourceUrl'],'https://cdn.example/rendition.mp3')

    def test_finished_jobs_do_not_block_new_tasks(self):
        # Ten completed/failed dirs must not trip the task cap — they only
        # hold results for the next poll and consume no resources.
        with tempfile.TemporaryDirectory() as d, patch.object(audio,'tool',side_effect=lambda name:name), patch.object(audio.subprocess,'Popen') as spawn:
            spawn.return_value.pid=4242
            jobs=Path(d)/'audio-jobs';jobs.mkdir()
            for index in range(10):
                job=jobs/(format(index,'032x'));job.mkdir()
                status='completed' if index%2 else 'failed'
                (job/'state.json').write_text(json.dumps({'status':status,'updated':0}))
            result=audio.handle({'action':'audioStart','videoId':'video123','provider':'groq','apiKey':'fixture'},Path(d))
            self.assertTrue(result['success']);spawn.assert_called_once()
    def test_active_jobs_still_hit_the_cap(self):
        with tempfile.TemporaryDirectory() as d, patch.object(audio,'tool',side_effect=lambda name:name), patch.object(audio.subprocess,'Popen') as spawn:
            spawn.return_value.pid=4242
            jobs=Path(d)/'audio-jobs';jobs.mkdir()
            for index in range(10):
                job=jobs/(format(index,'032x'));job.mkdir()
                (job/'state.json').write_text(json.dumps({'status':'working','updated':__import__('time').time()}))
            result=audio.handle({'action':'audioStart','videoId':'video123','provider':'groq','apiKey':'fixture'},Path(d))
            self.assertFalse(result['success']);spawn.assert_not_called()

    def test_audio_cancel_removes_a_terminal_job(self):
        with tempfile.TemporaryDirectory() as d:
            job=Path(d)/'audio-jobs'/('d'*32);job.mkdir(parents=True)
            (job/'state.json').write_text(json.dumps({'status':'completed'}))
            result=audio.handle({'action':'audioCancel','jobId':'d'*32},Path(d))
            self.assertTrue(result['success']);self.assertFalse(job.exists())
    def test_audio_cancel_kills_the_working_process_group(self):
        with tempfile.TemporaryDirectory() as d:
            job=Path(d)/'audio-jobs'/('e'*32);job.mkdir(parents=True)
            (job/'state.json').write_text(json.dumps({'status':'working','pid':424242}))
            class Ps: stdout='python3 audio_worker.py '+str(job)
            with patch.object(audio.subprocess,'run',return_value=Ps()),patch.object(audio.os,'killpg') as kill:
                result=audio.handle({'action':'audioCancel','jobId':'e'*32},Path(d))
            kill.assert_called_once();self.assertTrue(result['success']);self.assertFalse(job.exists())
    def test_audio_cancel_never_kills_an_unrelated_process(self):
        # A stale pid could have been reused by an unrelated process — the
        # command-line check must refuse to kill it.
        with tempfile.TemporaryDirectory() as d:
            job=Path(d)/'audio-jobs'/('f'*32);job.mkdir(parents=True)
            (job/'state.json').write_text(json.dumps({'status':'working','pid':424243}))
            class Ps: stdout='com.apple.WebKit.Networking'
            with patch.object(audio.subprocess,'run',return_value=Ps()),patch.object(audio.os,'killpg') as kill:
                audio.handle({'action':'audioCancel','jobId':'f'*32},Path(d))
            kill.assert_not_called();self.assertFalse(job.exists())

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
