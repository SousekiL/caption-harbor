#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
python3 scripts/install-native-host.py
printf '\nCaption Harbor environment bridge installed. Reload the extension in Chrome.\nPress Enter to close.\n'
read -r _harbor_done
