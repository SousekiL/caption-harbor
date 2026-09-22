#!/usr/bin/env python3
"""Package the independent offline mini-tool; never include extension files."""
import hashlib
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'minitool'
FILES = ('index.html', 'style.css', 'core.js', 'app.js')
OUTPUT = ROOT / 'dist' / 'caption-harbor-xiaohongshu-v1.0.0.zip'


def main():
    if set(p.name for p in SOURCE.iterdir()) != set(FILES):
        raise SystemExit('Unexpected mini-tool files; review the runtime allowlist.')
    for name in FILES:
        item = SOURCE / name
        if not item.is_file() or item.is_symlink():
            raise SystemExit('Missing or unsafe runtime file: ' + name)
    OUTPUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in FILES:
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 22, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, (SOURCE / name).read_bytes())
    if OUTPUT.stat().st_size > 10 * 1024 * 1024:
        raise SystemExit('Mini-tool ZIP exceeds the 10 MiB limit.')
    with zipfile.ZipFile(OUTPUT) as archive:
        if archive.testzip() is not None or 'index.html' not in archive.namelist():
            raise SystemExit('Invalid mini-tool ZIP.')
    print('Created ' + str(OUTPUT))
    print('Bytes: ' + str(OUTPUT.stat().st_size))
    print('SHA-256: ' + hashlib.sha256(OUTPUT.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
