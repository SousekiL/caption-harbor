# Caption Harbor

A calm workspace for learning from YouTube. Read bilingual captions, understand unfamiliar ideas, collect words with their original context, and review them in Eudic.

Personal fork of [Zara Zhang's YouTube Digest](https://github.com/zarazhangrui/youtube-digest), preserving the original MIT license and attribution. Built with plain JavaScript, HTML and CSS; no build step or hosted application server.

## Features

- Original, Chinese and bilingual captions, search, timestamp navigation, chapters, quotes and local notes inherited from YouTube Digest.
- Automatic audio transcription when native captions are missing, through Supadata `mode=auto`. Toggle native-only mode in Settings.
- Persistent asynchronous transcription job IDs. Reopen the panel to resume polling, without submitting another job. Unknown timeout outcomes require explicit reset rather than automatic resubmission.
- Import SRT/VTT files even without API keys; export SRT, VTT or the existing text transcript.
- Select a word or phrase to collect immediately, or request a contextual definition and editable lemma suggestion first. Concept explanations can also be saved as notes.
- Eudic authorization, wordbook selection/creation, original-sentence sync, local-first storage, deduplication and visible manual retries.
- Highlight previously collected words in later videos; click a highlight to see its saved occurrences and return to the source video.
- Previous caption, play/pause and caption looping. Panel shortcuts: Alt+Left, Alt+Space, Alt+L (outside text inputs).
- Video questions with verified clickable timestamp references and follow-up context. Long transcripts use bounded excerpts and clearly disclose partial coverage.
- Self-tests with answers hidden until revealed.
- Learning history with playback position, vocabulary counts and note counts. Vocabulary exports to CSV and Markdown.

## Install

1. Clone this repository into a permanent folder, or download and extract the release ZIP.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
3. Open extension **Settings**. Enter keys directly there, never in source files or chat.
4. Add your [Supadata key](https://dash.supadata.ai/) for captions and transcription and [DeepSeek key](https://platform.deepseek.com/api_keys) for AI features.
5. In **Caption Harbor · 学习设置**, add your [Eudic authorization](https://my.eudic.net/OpenAPI/Authorization), click connect, choose a wordbook and save.
6. Open a public YouTube watch page and click the extension icon or the page's Digest button.

Keep the installation folder in place. After source changes, reload the extension and refresh YouTube. Chrome 116+ is required; Firefox, Safari and mobile are not supported. The supplemental learning interface is currently Chinese; the upstream settings and reading modes retain their original language controls.

## Costs and limits

Automatic transcription is enabled by default in this edition. Supadata first uses available captions and otherwise processes audio on its servers. Native transcripts cost 1 credit; generated transcripts currently cost 2 credits per video minute. Review [current pricing](https://supadata.ai/pricing) and [transcript documentation](https://docs.supadata.ai/get-transcript). Disable automatic transcription if you only want native captions. Imported captions need neither Supadata nor an AI key.

Only publicly accessible completed videos are supported by the transcription service. Private, login-required, age-restricted videos and live streams can fail. A timed-out request may still be billable: check your provider dashboard before using Settings to reset that video's job.

Eudic receives the word/phrase and source sentence. Full AI explanations, multiple occurrences and timestamp links remain local. Eudic determines dictionary coverage for submitted phrases. Removing a local word does not remove it from Eudic. Synced words are not automatically moved when you change the default wordbook. Failed syncs retry only when requested, with rate-limited API calls.

Keys, notes, vocabulary, history and cached content are stored in this browser profile. There is no cross-device sync of plugin history and no automatic background retry while the browser is closed. Eudic's own account handles its wordbook synchronization. API keys in extension storage are not encrypted by this project. Uninstalling can remove local data; export vocabulary first.

## Development and validation

```sh
npm ci
npm test
npm run check
npm run package
npm run test:browser
```

The first browser test run needs `npx playwright install chromium`. The ZIP is written to `dist/caption-harbor-v2.0.7.zip` from a strict public-file allowlist. Tests cover subtitle parsing, transcription jobs, local collection, provider errors, request boundaries and browser interactions using controlled fixtures. Automated fixtures do not establish successful authentication or paid-provider operation on your account. Real Eudic, Supadata and DeepSeek calls require keys entered in Settings and a manual acceptance pass.

See [中文说明](README.zh-CN.md), [privacy](PRIVACY.md), [security](SECURITY.md), and [MIT license](LICENSE).

## Optional local environment credentials (2.0.1)

Chrome cannot read shell environment variables directly. The optional native-messaging bridge reads `EUDIC_TOKEN` from its process environment, or loads it from `~/.config/caption-harbor/secrets.env` (owner-only permissions, 0600). The token is passed only to the extension background request in memory and is not copied into browser storage, source files or release ZIPs. This is a per-application environment file, not a system-wide shell export.

On macOS, double-click **Install environment.command** in the folder Chrome actually loaded. Alternatively run `npm run install:environment`. On Linux run `python3 scripts/install-native-host.py`. For an extension loaded from another folder, pass `--extension-id` with its ID from `chrome://extensions`. The installer registers only that extension and requires permission to write the browser's NativeMessagingHosts directory. On macOS, if the app is denied access to the Chrome profile, run the installer in Terminal with the necessary OS file access. Windows native installation is not currently supported; manual token entry remains available.

Choose **本机环境变量（EUDIC_TOKEN）** in learning Settings, check the environment connection, then connect and select your Eudic wordbook. Manual mode remains available. Selecting environment mode and saving clears any previously stored browser token. The environment file never runs shell commands or variable interpolation. `npm run test:native` verifies the host protocol and origin boundary.


BrowserOS: `python3 scripts/install-native-host.py --browser browseros`. BrowserOS neo: `--browser browseros-neo`. The installer auto-detects an existing profile (BrowserOS, Chrome, then BrowserOS neo). `--profile-dir` overrides detection.


Subtitle appearance: select system, sans-serif, serif or monospace fonts and a 12–32 px size in Settings. Changes apply to original and translated captions and persist locally.


Roboto Slab 与 Lexend 已内置，无需安装系统字体或连接字体服务；中文回退到系统字体。字体来源和许可见 [fonts/README.md](fonts/README.md)。


The sidebar uses timestamps above each caption, a compact playback toolbar, and a subtitle-file menu for import/copy/export. Appearance controls are only in Settings. Follow playback fetches the current time from the bound video tab, reconnects a missing player script when possible, and scrolls only the caption container.


Playback follows by default, including video timeline seeks and automatic layout scrolling. Only wheel/touch scrolling, scroll-navigation keys, or scrollbar dragging inside captions pauses following. A manual pause survives panel-tab switches until Follow playback is clicked; a fresh panel or new video defaults to following.


Playback state now travels directly from the bound YouTube tab to the side panel. Empty or missing content-script replies fall back to a scoped media-element read, with video-ID checks before and after, instead of relying on the background runtime reply.
