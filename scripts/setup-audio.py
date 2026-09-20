#!/usr/bin/env python3
"""Explicit local audio setup. Never runs automatically on selecting a provider."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model',choices=['base.en','small.en','small'],default='small.en')
parser.add_argument('--groq-only',action='store_true')
args=parser.parse_args()
brew=shutil.which('brew')
if sys.platform!='darwin' or not brew:
    parser.error('Install yt-dlp, FFmpeg and whisper.cpp manually on this system. On macOS, install Homebrew first.')
required={'yt-dlp':'yt-dlp','ffmpeg':'ffmpeg',**({} if args.groq_only else {'whisper-cli':'whisper-cpp'})}
missing=[package for executable,package in required.items() if not shutil.which(executable)]
if missing:subprocess.run([brew,'install',*missing],check=True)
if not args.groq_only:
    folder=Path.home()/'.config/caption-harbor/models';folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    target=folder/('ggml-'+args.model+'.bin')
    if not target.exists():
        temporary=target.with_suffix('.part')
        try:
            urllib.request.urlretrieve('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/'+target.name,temporary)
            if temporary.stat().st_size<1000000:raise ValueError('Incomplete model download')
            temporary.replace(target)
        finally:temporary.unlink(missing_ok=True)
print('Local audio components installed. Run the native helper installer, then check Settings.')
