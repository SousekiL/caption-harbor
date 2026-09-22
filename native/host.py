#!/usr/bin/env python3
"""Small allowlisted native-messaging host; stdout is protocol-only."""
import json
import os
from pathlib import Path
import stat
import struct
import sys

MAX_REQUEST = 4096
SERVICE_KEYS = {"groq": "GROQ_API_KEY", "deepseek": "DEEPSEEK_API_KEY"}


def read_secret(env_file, name):
    """Read one allowlisted credential; never evaluate or expose other variables."""
    if name not in ('EUDIC_TOKEN', 'GROQ_API_KEY', 'DEEPSEEK_API_KEY'):
        raise ValueError('Unsupported credential.')
    token = os.environ.get(name, '').strip()
    if not token:
        path = Path(env_file)
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
            raise ValueError('Environment file must be an owner-only regular file (0600).')
        if info.st_size > 65536:
            raise ValueError('Environment file is too large.')
        for line in path.read_text(encoding='utf-8').splitlines():
            key, sep, value = line.removeprefix('export ').partition('=')
            if sep and key.strip() == name:
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                    value = value[1:-1]
                token = value.strip()
        # No shell evaluation, interpolation, subprocesses, or generic env lookup.
        if token:
            os.environ[name] = token
    if not token or len(token) > 4096 or any(c in token for c in '\r\n\x00'):
        raise ValueError('Requested credential is missing or invalid.')
    return token


def read_token(env_file):
    return read_secret(env_file, 'EUDIC_TOKEN')


def handle(message, config):
    action = message.get('action') if isinstance(message, dict) else None
    if action == 'credentialsStatus':
        configured = {}
        for service, name in SERVICE_KEYS.items():
            try:
                configured[service] = bool(read_secret(config['env_file'], name))
            except (OSError, ValueError):
                configured[service] = False
        return {'success': True, 'configured': configured}
    if action == 'getServiceKey':
        service = message.get('service')
        if not isinstance(service, str) or service not in SERVICE_KEYS:
            return {'success': False, 'error': 'Unsupported credential service.'}
        return {'success': True, 'key': read_secret(config['env_file'], SERVICE_KEYS[service])}
    if action in ('audioStatus', 'audioStart', 'audioPoll', 'audioCancel', 'audioResolve'):
        import audio_worker
        return audio_worker.handle(message, Path(config['env_file']).parent)
    if action not in ('status', 'getEudicToken'):
        return {'success': False, 'error': 'Unsupported action.'}
    token = read_token(config['env_file'])
    if action == 'status':
        return {'success': True, 'configured': True, 'source': 'environment'}
    return {'success': True, 'token': token}


def main():
    try:
        config = json.loads(Path(__file__).with_name('bridge.json').read_text())
        origin = sys.argv[1].rstrip('/') + '/' if len(sys.argv) > 1 else ''
        if origin not in config['allowed_origins']:
            return
        header = sys.stdin.buffer.read(4)
        if len(header) != 4:
            return
        length = struct.unpack('=I', header)[0]
        if not 0 < length <= MAX_REQUEST:
            return
        raw = sys.stdin.buffer.read(length)
        if len(raw) != length:
            return
        result = handle(json.loads(raw), config)
    except Exception:
        # Do not include exception data, request content, paths or credentials.
        result = {'success': False, 'error': 'Requested local credential is unavailable. Check the private environment file.'}
    data = json.dumps(result).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(data)) + data)
    sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
