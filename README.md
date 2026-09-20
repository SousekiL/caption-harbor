# Caption Harbor

A YouTube learning workspace with readable captions, contextual explanations, Eudic vocabulary, and local transcription. Forked from [Zara Zhang's YouTube Digest](https://github.com/zarazhangrui/youtube-digest), preserving its MIT license and attribution.

## Version 2.1

Settings now have two main sections: **Subtitles & AI** and **Learning settings**. The interface-language choice applies to both Settings and the video side panel. Caption-content language (Original / Chinese / Bilingual) is independent.

- Read existing YouTube captions without a Supadata API key: try the open video page first, then the optional local yt-dlp helper.
- When captions are unavailable, choose Supadata, Groq, or local Whisper. Configuration fields appear for the selected method.
- Supadata remains an optional cloud fallback. Groq requires a Groq key plus local audio preparation tools. Local Whisper requires no transcription API key, but uses this computer's CPU/GPU and RAM.
- Retain bilingual reading, timestamps above captions, search, font/size settings (including bundled Roboto Slab and Lexend), sentence looping, video questions, self-tests, notes, vocabulary and Eudic sync.
- Follow video seeks automatically. Only manually scrolling captions pauses following.

## Install

1. Keep this checkout or an extracted release ZIP in a permanent folder.
2. In BrowserOS or Chrome, open `chrome://extensions`, enable Developer mode, and **Load unpacked** the folder containing `manifest.json`.
3. Open extension Settings. Choose English or Chinese at the top. Add a DeepSeek key if you want translation, explanations, questions and notes processing. Caption reading does not require an AI key.
4. Supadata is optional. If you enable transcription, choose the provider and fill its configuration, then save service settings.
5. Configure Eudic and appearance in Learning settings. The Eudic token may be entered manually or read from the local environment bridge.

Reload the extension and reopen its panel after updates. Chromium 116+ is required. BrowserOS is supported; Firefox, Safari and mobile are not.

## Local captions and audio

The page reader uses captions available to the current YouTube page, including its visible transcript. YouTube changes, unloaded tabs and caption access restrictions can prevent retrieval. The local helper offers a second path with yt-dlp. Neither path guarantees access to every video. No fabricated tokens or account-cookie exports are used.

On macOS, install the helper from the extension folder:

```sh
python3 scripts/setup-audio.py --model small.en
python3 scripts/install-native-host.py --browser browseros
```

This installs yt-dlp, FFmpeg, whisper.cpp and the selected model. For Groq without local transcription, use `--groq-only` instead of `--model small.en`. For BrowserOS neo, use `--browser browseros-neo`; for Chrome use `--browser chrome`. Existing browser profiles are detected when no browser is specified. `--profile-dir` and `--extension-id` handle custom installations.

Whisper Base.en and Small.en are English-only; Small is multilingual. Only the models downloaded on your computer can run. The model files stay outside the repository under `~/.config/caption-harbor/models`. Windows requires manual setup or the Supadata path; the bundled installer supports macOS/Linux for host registration and Homebrew/macOS for dependency installation.

Local-helper audio jobs support publicly accessible videos up to four hours and 500 MB source files. Groq uploads five-minute audio chunks and merges their timestamped segments. Chunk boundaries may affect recognition. Local Whisper transcribes downloaded audio on your machine. Jobs continue in a local process if the panel closes, and reopening resumes status polling. Old files are removed on a new job after 24 hours; up to ten recent jobs are retained. Do not assume provider failures cancel already-billable work.

## Credentials and cost

Existing YouTube captions and local Whisper have no third-party transcription fee. Supadata and Groq charge under their own plans; DeepSeek charges separately for AI features. See [Supadata pricing](https://supadata.ai/pricing) and [Groq transcription documentation](https://console.groq.com/docs/speech-to-text).

Keys go only in Settings or the private environment file, never in source code or chat. The optional native host reads `EUDIC_TOKEN` from its environment or `~/.config/caption-harbor/secrets.env` (0600). Groq keys are kept in trusted extension storage and passed to the local audio worker in memory, not written into job files. Audio is sent to Groq only when that provider is selected. Settings show the relevant cloud cost or local resource-use notice.

## Validation

```sh
npm ci
npm test
npm run test:native
npx playwright install chromium
npm run test:browser
npm run check
npm run package
```

The installable ZIP is `dist/caption-harbor-v2.1.0.zip`. Tests cover configuration, interface languages, native job boundaries, provider request construction, subtitle routing, persistence and browser interactions. Actual local caption retrieval and a short Whisper transcription were verified on macOS; Groq requests are covered with controlled responses until a real Groq key is supplied.

See [中文说明](README.zh-CN.md), [local setup](LOCAL-SETUP.html), [privacy](PRIVACY.md), [security](SECURITY.md) and [font licenses](fonts/README.md).
