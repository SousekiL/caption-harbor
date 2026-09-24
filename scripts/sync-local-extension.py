#!/usr/bin/env python3
"""Synchronize checked extension files to an explicitly configured unpacked install."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

SOURCE = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = Path.home() / '.config/caption-harbor/dev-install.json'


def read_manifest(root):
    path = root / 'manifest.json'
    if path.is_symlink() or not path.is_file():
        raise ValueError('Target must contain a regular manifest.json.')
    value = json.loads(path.read_text())
    if value.get('name') != 'Caption Harbor' or value.get('manifest_version') != 3:
        raise ValueError('Target is not a Caption Harbor extension directory.')
    return value


def checked_files(source):
    check = subprocess.run(['bash', str(source / 'scripts/check-release.sh'), '--print-files'],
                           cwd=source, capture_output=True, text=True)
    if check.returncode:
        raise ValueError('Release validation failed; nothing synchronized.\n' + check.stderr[-3000:])
    files = check.stdout.splitlines()
    if 'manifest.json' not in files:
        raise ValueError('Release allowlist has no manifest.json.')
    return files


def validate_path(root, name):
    relative = Path(name)
    if relative.is_absolute() or '..' in relative.parts or not name:
        raise ValueError('Unsafe release path.')
    part = root
    for component in relative.parts:
        part = part / component
        if part.is_symlink():
            raise ValueError('Refusing a symlink in extension files: ' + name)
    if part.exists() and not part.is_file():
        raise ValueError('Expected a regular extension file: ' + name)
    return part


def atomic_write(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.harbor-sync-', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def synchronize(source, target, files, backup_root, dry_run=False):
    source, target = source.resolve(), target.resolve()
    before, after = read_manifest(target), read_manifest(source)
    if before.get('key') != after.get('key'):
        raise ValueError('Manifest identity keys differ; refusing to change extension identity.')
    changes = []
    for name in files:
        src, dst = validate_path(source, name), validate_path(target, name)
        data = src.read_bytes()
        if not dst.exists() or dst.read_bytes() != data:
            changes.append((name, dst, data))
    if dry_run or not changes:
        return {'version': after['version'], 'changed_files': len(changes), 'dry_run': dry_run}
    # Publish the manifest last so version visibility follows resource updates.
    changes.sort(key=lambda item: item[0] == 'manifest.json')
    backup_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup = Path(tempfile.mkdtemp(prefix=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-'), dir=backup_root))
    previous, written = {}, []
    for name, dst, data in changes:
        previous[name] = dst.read_bytes() if dst.exists() else None
        if previous[name] is not None:
            atomic_write(backup / name, previous[name], 0o600)
    try:
        for name, dst, data in changes:
            atomic_write(dst, data)
            written.append((name, dst))
        for name, dst, data in changes:
            if dst.read_bytes() != data:
                raise ValueError('Synchronized file verification failed: ' + name)
    except Exception:
        for name, dst in reversed(written):
            if previous[name] is None:
                dst.unlink(missing_ok=True)
            else:
                atomic_write(dst, previous[name])
        raise
    return {'version': after['version'], 'changed_files': len(changes), 'backup': str(backup)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', type=Path, help='Existing folder selected in Load unpacked; remembered after success.')
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    config = args.config.expanduser()
    target = args.target
    if target is None:
        if not config.is_file() or config.is_symlink():
            raise ValueError('No fixed install configured. Supply --target with the folder currently loaded by your browser.')
        saved = json.loads(config.read_text())
        if saved.get('source') != str(SOURCE.resolve()):
            raise ValueError('Configured source is a different checkout; supply --target explicitly.')
        target = Path(saved['target'])
    if target.is_symlink():
        raise ValueError('Choose the actual extension directory, not a symlink.')
    target = target.expanduser().resolve()
    read_manifest(target)  # Fail early before running checks on a wrong path.
    result = synchronize(SOURCE, target, checked_files(SOURCE), config.parent / 'dev-backups', args.dry_run)
    if not args.dry_run:
        config.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        atomic_write(config, (json.dumps({'source':str(SOURCE.resolve()), 'target':str(target)}, indent=2)+'\n').encode(), 0o600)
    print(json.dumps({'target':str(target), **result}, ensure_ascii=False))
    print('Reload Caption Harbor in the browser and refresh video pages after synchronization.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error))
