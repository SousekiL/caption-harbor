#!/usr/bin/env python3
"""Install the optional Eudic environment bridge on macOS or Linux."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys

HOST = 'com.caption_harbor.environment'


def extension_id(root):
    digest = hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:32]
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest)


def browser_profile(browser, home=None, platform=None):
    home = Path.home() if home is None else Path(home)
    platform = sys.platform if platform is None else platform
    if platform == 'darwin':
        base = home/'Library'/'Application Support'
        locations = {'browseros':base/'BrowserOS', 'browseros-neo':base/'BrowserClaw', 'chrome':base/'Google'/'Chrome', 'edge':base/'Microsoft Edge'}
    else:
        base = home/'.config'
        locations = {'browseros':base/'browseros', 'browseros-neo':base/'browserclaw', 'chrome':base/'google-chrome', 'edge':base/'microsoft-edge'}
    if browser != 'auto':
        return locations[browser]
    for name in ('browseros', 'chrome', 'edge', 'browseros-neo'):
        if locations[name].is_dir():
            return locations[name]
    raise ValueError('No supported browser profile found. Specify --browser or --profile-dir.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extension-id', help='ID shown at chrome://extensions; defaults to this checkout path')
    parser.add_argument('--config-dir', type=Path, default=Path.home()/'.config'/'caption-harbor')
    parser.add_argument('--profile-dir', type=Path, help='Custom browser user-data directory')
    parser.add_argument('--browser', choices=['auto', 'browseros', 'browseros-neo', 'chrome', 'edge'], default='auto', help='Browser whose native host directory to register')
    args = parser.parse_args()
    if sys.platform not in ('darwin', 'linux'):
        parser.error('The native bridge installer currently supports macOS and Linux.')
    root = Path(__file__).resolve().parent.parent
    identifier = args.extension_id or extension_id(root)
    if not re.fullmatch('[a-p]{32}', identifier):
        parser.error('Extension ID must have 32 letters between a and p.')
    folder = args.config_dir.expanduser().resolve()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    folder.chmod(0o700)
    origins = [f'chrome-extension://{identifier}/']
    # Keep origins granted by earlier installs (e.g. a different extension ID
    # in another browser) instead of revoking them on re-run.
    bridge_file = folder/'bridge.json'
    if bridge_file.exists():
        try:
            origins = list(dict.fromkeys(
                origins + json.loads(bridge_file.read_text()).get('allowed_origins', [])
            ))
        except Exception:
            pass
    env_file = folder/'secrets.env'
    if not env_file.exists():
        fd = os.open(env_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd,'w') as stream:
            stream.write('# Set EUDIC_TOKEN here. Never put this file in the repository.\n')
    env_file.chmod(0o600)
    shutil.copyfile(root/'native'/'host.py', folder/'host.py')
    (folder/'host.py').chmod(0o600)
    shutil.copyfile(root/'native'/'audio_worker.py', folder/'audio_worker.py')
    (folder/'audio_worker.py').chmod(0o600)
    (folder/'bridge.json').write_text(json.dumps({'env_file':str(env_file),'allowed_origins':origins},indent=2)+'\n')
    (folder/'bridge.json').chmod(0o600)
    launcher = folder/'launch-host'
    launcher.write_text('#!/bin/sh\nexec '+shlex.quote(sys.executable)+' '+shlex.quote(str(folder/'host.py'))+' "$@"\n')
    launcher.chmod(0o700)
    if args.profile_dir:
        profiles = [args.profile_dir.expanduser().resolve()]
    else:
        profiles = [browser_profile(args.browser)]
    manifest = {'name':HOST,'description':'Read the local EUDIC_TOKEN for Caption Harbor','path':str(launcher),'type':'stdio','allowed_origins':origins}
    for profile in profiles:
        directory = profile/'NativeMessagingHosts'
        directory.mkdir(parents=True,exist_ok=True)
        file = directory/(HOST+'.json')
        file.write_text(json.dumps(manifest,indent=2)+'\n')
        file.chmod(0o600)
    print('Environment bridge installed for extension '+identifier+'. No credential values displayed.')
    print('Browser profile: '+str(profiles[0]))


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except PermissionError:
        print('macOS or filesystem permissions prevented browser registration. Run this installer from Terminal with access to the selected browser profile directory.', file=sys.stderr)
        sys.exit(1)
