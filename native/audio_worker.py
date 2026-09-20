"""Fixed-purpose audio jobs. No shell commands or persisted API keys."""
import base64
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid
import urllib.request

MODELS = ('base.en', 'small.en', 'small')

def tool(name):
    for path in (Path('/opt/homebrew/bin')/name, Path('/usr/local/bin')/name):
        if path.is_file() and os.access(path,os.X_OK):return str(path)
    return shutil.which(name)

def capabilities(folder):
    return {'success':True,'ytdlp':bool(tool('yt-dlp')),'ffmpeg':bool(tool('ffmpeg')),'whisper':bool(tool('whisper-cli')),'models':[m for m in MODELS if (folder/'models'/('ggml-'+m+'.bin')).is_file()]}

def write_state(job, value):
    temp=job/'state.tmp';temp.write_text(json.dumps(value));temp.replace(job/'state.json')

def job_path(folder, identifier):
    if not re.fullmatch('[a-f0-9]{32}',str(identifier)):raise ValueError('Invalid task')
    path=folder/'audio-jobs'/identifier
    if not path.is_dir() or path.is_symlink():raise ValueError('Task not found')
    return path

def handle(message, folder):
    action=message.get('action')
    if action=='audioStatus':return capabilities(folder)
    if action=='audioPoll':
        job=job_path(folder,message.get('jobId'))
        result=json.loads((job/'state.json').read_text())
        if result.get('status')=='working' and time.time()-result.get('updated',0)>7600:return {'success':False,'error':'Audio task timed out; reset it in Settings.'}
        return {'success':True,**result}
    if action!='audioStart':return {'success':False,'error':'Unsupported audio action.'}
    video=message.get('videoId','');provider=message.get('provider');model=message.get('model','small.en')
    if not re.fullmatch(r'[\w-]{6,20}',video) or provider not in ('groq','local','captions') or model not in MODELS:return {'success':False,'error':'Invalid audio request.'}
    caps=capabilities(folder)
    if not caps['ytdlp'] or (provider != 'captions' and not caps['ffmpeg']):return {'success':False,'error':'Install yt-dlp and FFmpeg using the local setup instructions.'}
    if provider=='local' and (not caps['whisper'] or model not in caps['models']):return {'success':False,'error':'Local Whisper or the selected model is not installed.'}
    if provider=='groq' and not isinstance(message.get('apiKey'),str):return {'success':False,'error':'Groq API key is missing.'}
    jobs=folder/'audio-jobs';jobs.mkdir(exist_ok=True,mode=0o700)
    # Finished task files contain audio/transcripts, never keys. Remove old jobs.
    for old in jobs.iterdir():
        if old.is_dir() and not old.is_symlink() and time.time()-old.stat().st_mtime>86400:shutil.rmtree(old)
    if len(list(jobs.iterdir()))>=10:return {'success':False,'error':'Too many recent audio tasks; try again later.'}
    identifier=uuid.uuid4().hex;job=jobs/identifier;job.mkdir(mode=0o700)
    write_state(job,{'status':'working','stage':'download','updated':time.time()})
    child=subprocess.Popen([sys.executable,str(Path(__file__)),str(job)],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    request={'videoId':video,'provider':provider,'model':model,'groqModel':message.get('groqModel','whisper-large-v3-turbo'),'apiKey':message.get('apiKey','')}
    child.stdin.write(json.dumps(request).encode());child.stdin.close()
    return {'success':True,'jobId':identifier,'status':'working'}

def command(args, timeout):
    result=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=timeout)
    if result.returncode:raise ValueError('Unable to prepare or transcribe this video. Check the local tools and video accessibility.')

def run(job, req):
    video=req['videoId'];folder=job.parent.parent
    if req['provider']=='captions':
        try:
            # yt-dlp can download a preferred English track successfully and
            # then exit non-zero when an optional translated track is rate
            # limited. Inspect completed files regardless of that exit code.
            subprocess.run([tool('yt-dlp'),'--no-playlist','--no-progress','--retries','1','--socket-timeout','20','--skip-download','--write-subs','--write-auto-subs','--sub-langs','en,en-orig,zh-Hans,zh-Hant','--sub-format','json3','-o',str(job/'captions.%(ext)s'),'--','https://www.youtube.com/watch?v='+video],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=90)
            files=sorted(job.glob('captions.*.json3'),key=lambda p:('.en.' not in p.name,p.name))
            if files:
                data=json.loads(files[0].read_text());content=[]
                for event in data.get('events',[]):
                    text=''.join(s.get('utf8','') for s in event.get('segs',[])).strip()
                    if text and isinstance(event.get('tStartMs'),(int,float)):content.append({'offset':event['tStartMs'],'duration':event.get('dDurationMs',1000),'text':text})
                if content and len(json.dumps(content).encode()) < 850000:
                    write_state(job,{'status':'completed','content':content});return
        except Exception:pass
        write_state(job,{'status':'unavailable'});return
    command([tool('yt-dlp'),'--no-playlist','--no-progress','--retries','1','--socket-timeout','30','--max-filesize','500M','--match-filter','duration <= 14400','-f','bestaudio','-o',str(job/'input.%(ext)s'),'--','https://www.youtube.com/watch?v='+video],300)
    files=[p for p in job.glob('input.*') if p.suffix not in ('.part','.ytdl')]
    if len(files)!=1:raise ValueError('Audio was unavailable or exceeded the four-hour/500 MB limit.')
    media=files[0]
    write_state(job,{'status':'working','stage':'transcribe','updated':time.time()})
    content=[]
    if req['provider']=='local':
        wav=job/'audio.wav'
        command([tool('ffmpeg'),'-v','error','-i',str(media),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(wav)],300)
        command([tool('whisper-cli'),'-m',str(folder/'models'/('ggml-'+req['model']+'.bin')),'-f',str(wav),'-oj','-of',str(job/'transcript'),'-l','en' if req['model'].endswith('.en') else 'auto'],7200)
        result=json.loads((job/'transcript.json').read_text())
        for segment in result.get('transcription',[]):
            offsets=segment.get('offsets',{});start=offsets.get('from');end=offsets.get('to')
            if isinstance(start,(float,int)) and isinstance(end,(float,int)):
                content.append({'offset':start,'duration':max(1,end-start),'text':segment.get('text','').strip()})
    else:
        # Five-minute files stay below Groq's attachment limit. API credentials
        # exist only in this process's memory and the HTTPS authorization header.
        command([tool('ffmpeg'),'-v','error','-i',str(media),'-ar','16000','-ac','1','-c:a','pcm_s16le','-f','segment','-segment_time','300',str(job/'part-%04d.wav')],300)
        groq_model=req.get('groqModel')
        if groq_model not in ('whisper-large-v3','whisper-large-v3-turbo'):raise ValueError('Unsupported Groq model.')
        for index,part in enumerate(sorted(job.glob('part-*.wav'))):
            boundary='Harbor'+uuid.uuid4().hex
            body=bytearray()
            for key,value in {'model':groq_model,'response_format':'verbose_json','timestamp_granularities[]':'segment','temperature':'0'}.items():
                body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
            body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode());body.extend(part.read_bytes());body.extend(f'\r\n--{boundary}--\r\n'.encode())
            request=urllib.request.Request('https://api.groq.com/openai/v1/audio/transcriptions',data=bytes(body),headers={'Authorization':'Bearer '+req['apiKey'],'Content-Type':'multipart/form-data; boundary='+boundary})
            try:
                with urllib.request.urlopen(request,timeout=120) as response: result=json.load(response)
            except Exception:raise ValueError('Groq transcription failed. Check the key and usage limits; completed requests may still be billable.')
            for segment in result.get('segments',[]):
                start=segment.get('start');end=segment.get('end')
                if isinstance(start,(float,int)) and isinstance(end,(float,int)):
                    content.append({'offset':(index*300+start)*1000,'duration':max(1,(end-start)*1000),'text':segment.get('text','').strip()})
            part.unlink()
    content=[x for x in content if x['text']]
    if not content:raise ValueError('No speech was detected.')
    for path in job.iterdir():
        if path.name not in ('state.json',):path.unlink(missing_ok=True)
    result={'status':'completed','content':content}
    if len(json.dumps(result).encode())>850000:raise ValueError('Transcript is too large. Import a shorter subtitle file.')
    write_state(job,result)

if __name__=='__main__':
    job=Path(sys.argv[1])
    try:
        req=json.loads(sys.stdin.buffer.read(8192));run(job,req)
    except Exception as error:
        text=str(error) if isinstance(error,ValueError) else 'Local audio task failed. Check the setup and try again.'
        write_state(job,{'status':'failed','error':text})
