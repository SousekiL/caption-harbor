# Caption Harbor

[English](README.md) | [简体中文](README.zh-CN.md) · [Download a release](https://github.com/SousekiL/caption-harbor/releases)

Read YouTube captions, understand unfamiliar ideas, and keep the words you want to learn. Caption Harbor puts transcripts, bilingual reading, contextual AI explanations, Eudic vocabulary and notes beside the video.

**Caption Harbor is an independent fork of [YouTube Digest by Zara Zhang](https://github.com/zarazhangrui/youtube-digest).** It builds on her original reading experience and adds alternative caption sources, local transcription and a personal vocabulary workflow. The original MIT license and attribution are preserved. This fork is maintained separately; it is not an official release from Zara.

- Read original, Chinese or bilingual captions and search for words or phrases.
- Follow the current video position, with timestamps above each caption.
- Select a word or concept for an explanation, then save its source sentence and timestamp.
- Sync collected vocabulary to an Eudic wordbook.
- Read available YouTube captions without a Supadata key, or transcribe audio using Supadata, Groq or local Whisper.
- Keep keys and learning records on your device; choose which external services to use.

This project is installed locally from GitHub, not through the Chrome Web Store. It has no developer-hosted server, bundled API credits or automatic extension updates. Cloud providers charge separately. The current release is a beta.

![Caption Harbor running beside a YouTube video, with transcript selection and learning actions](docs/images/feature-overview.png)

## What comes from YouTube Digest, and what changed?

| Area | Original YouTube Digest foundation | Caption Harbor additions and changes |
| --- | --- | --- |
| Reading | Side panel, timestamp navigation, caption search and bilingual translation | Timestamps above text, a cleaner header, persistent font/size controls and bundled Roboto Slab / Lexend |
| Caption sources | Supadata native transcripts | Direct YouTube page reading and an optional local yt-dlp fallback; Supadata is no longer mandatory for available captions |
| Audio transcription | Native-caption-only workflow | Choose Supadata, Groq or local Whisper when captions cannot be obtained |
| Understanding | AI overviews, chapters, selected-text explanations and notes | Separate word/concept explanations, editable lemma suggestions, follow-up questions and self-tests |
| Vocabulary | No dedicated vocabulary workflow | Local wordbook, original sentences, multiple video occurrences, Eudic sync and retry status |
| Learning history | Notes and recent transcript caches | Video history, saved playback positions and vocabulary/note counts |
| Playback following | Transcript highlighting and scrolling | Bound-video playback reads; video seeks keep following, while manual caption scrolling pauses it |
| Settings | Provider keys and options-page language controls | Two sections, Subtitles & AI and Learning settings; one interface-language choice also applies to the side panel |

## New in 2.1.2

- Prevent a slower result from the previous YouTube video from replacing the current video's title or transcript after single-page navigation.
- Navigation metadata, cache and transcript writes now share one generation guard, so stale asynchronous work is discarded at every boundary.

## New in 2.1.1

- Extension icons and the on-video Digest / Note buttons use `#3D755D`.
- The reader keeps caption search, previous/next search matches, Copy and Export.
- The extra Previous sentence / Play-pause / Loop sentence / Subtitle files toolbar has been removed.
- This README now separates inherited features from fork-specific improvements and explains setup by workflow.

## Install with your coding agent

Give your coding agent the repository link and this request:

> Install https://github.com/SousekiL/caption-harbor into a permanent folder. Tell me the exact folder to load in my browser. Check whether I use BrowserOS, BrowserOS neo or Chrome before configuring any native helper. Help me choose caption sources and enter credentials directly in Settings. Do not put keys in source files or chat. Verify caption reading and playback following on a video I choose.

For local transcription, also ask the agent to check the available CPU, memory and model before downloading dependencies. The local helper is optional for page-readable captions and the Supadata route.

## Install manually

1. Download the ZIP from [Releases](https://github.com/SousekiL/caption-harbor/releases), or clone this repository.
2. Extract it into a permanent folder. Keep that folder in place.
3. In BrowserOS or Chrome, open `chrome://extensions`.
4. Enable **Developer mode**, click **Load unpacked**, and select the folder containing `manifest.json`.
5. Pin Caption Harbor if you want quick access, then open a standard YouTube video.
6. Click the extension icon or the video's **Digest** button to open the reader.

After an update, click the circular **Reload** arrow on the extension card and reopen the side panel. Refresh the video page if its on-video buttons still use the previous version. Moving the source folder changes an unpacked extension's identity and may require loading it and registering the native helper again.

## Configure Subtitles & AI

The English / Chinese switch at the top controls interface text in Settings and the side panel. **Original / Chinese / Bilingual** in the reader controls caption content separately.

Caption Harbor first checks its cache, then attempts to read captions available to the YouTube page. If installed, the local helper provides a second route through yt-dlp. These paths do not require Supadata or DeepSeek keys. Availability still depends on YouTube and the video.

Enable **Automatically transcribe when captions are unavailable** if you also want audio transcription. Choose a method and save the service settings:

| Method | What to configure | What it uses |
| --- | --- | --- |
| Supadata | [Supadata API key](https://dash.supadata.ai/) | Cloud transcript retrieval/generation; credits charged by Supadata |
| Groq | [Groq API key](https://console.groq.com/keys), local yt-dlp + FFmpeg helper | Local audio preparation, then paid cloud transcription |
| Local Whisper | Local helper, whisper.cpp and a downloaded model | This computer's CPU/GPU and RAM; no transcription API fee |

A **[DeepSeek API key](https://platform.deepseek.com/api_keys)** is separate: it powers translation, overviews, explanations, questions and AI note processing. The current AI integration uses DeepSeek V4 Flash. Reading captions alone does not require it.

Enter keys only in Settings. Supadata, Groq and DeepSeek have separate accounts and usage limits. Check [Supadata pricing](https://supadata.ai/pricing) and [Groq speech-to-text documentation](https://console.groq.com/docs/speech-to-text) before enabling cloud transcription.

## Configure local transcription

On macOS with Homebrew, run these commands **from the extension folder**:

```sh
python3 scripts/setup-audio.py --model small.en
python3 scripts/install-native-host.py --browser browseros
```

- Use `--browser chrome` for Chrome or `--browser browseros-neo` for BrowserOS neo.
- Use `--groq-only` instead of `--model small.en` if you only need Groq's audio preparation tools.
- `base.en` and `small.en` are English-only; `small` supports multiple languages. Only downloaded models can run.
- Custom installations can pass `--profile-dir` and `--extension-id` to the helper installer.

In Settings, choose **Local Whisper**, choose the installed model, click **Check local components**, and save. Model files stay in `~/.config/caption-harbor/models`, outside the repository and ZIP. Local transcription may increase heat, memory use and battery consumption.

Host registration supports macOS/Linux; the dependency installer uses Homebrew on macOS. Other systems need manual tool setup. See [local setup details](LOCAL-SETUP.html).

## Configure Learning settings

### Eudic vocabulary

1. Choose manual entry or the local environment credential source.
2. For manual entry, obtain your [Eudic authorization](https://my.eudic.net/OpenAPI/Authorization) and paste it into Settings.
3. Click **Save and load wordbooks**, choose a default wordbook or create one, and save learning settings.
4. Select a word in the transcript and choose **Collect**, or use **Word meaning** to review an editable lemma first.

Collection saves locally before attempting Eudic sync. Failed items retain a retry button. Eudic receives the word/phrase and its original sentence; the plugin retains explanations, video links and additional occurrences. Deleting a local record does not delete the Eudic copy.

For environment mode, install the native helper and store `EUDIC_TOKEN` in `~/.config/caption-harbor/secrets.env` with owner-only `0600` permissions. The token is read for requests and is not copied into browser storage. This is an application-specific environment file, not a system-wide shell setting.

### Reading appearance

Choose a font and a size between 12 and 32 px in Settings. Changes apply to original and translated captions and are saved automatically. Roboto Slab and Lexend are bundled; Chinese characters fall back to system fonts. Appearance controls stay out of the reader.

## Use Caption Harbor

1. Open a YouTube video and the side panel.
2. Read the captions or choose bilingual mode. Click a timestamp to seek the video.
3. Search for a word or phrase, then use the arrows to move between matches. Copy or export the displayed transcript from the heading.
4. Select text to explain a word, understand a concept, save a note or collect vocabulary.
5. Open **Vocabulary** to revisit source sentences or retry Eudic sync. Previously collected words are highlighted in captions.
6. Use **Ask** for transcript-grounded questions and self-tests, and **History** to return to previous videos.

Following is enabled by default and survives video timeline seeks. Manually scrolling captions pauses it; **Follow playback** resumes it. Advanced panel shortcuts remain available outside input fields: Alt+Left for the previous sentence, Alt+Space for play/pause and Alt+L for sentence looping.

## What works today

- Chromium 116+, with BrowserOS and Chrome verification. Firefox, Safari and mobile are not supported.
- Existing page-readable captions, optional local caption retrieval, and the selected transcription fallback.
- Publicly accessible audio tasks up to four hours and 500 MB source files. Private, restricted and ongoing live videos may fail.
- Groq audio is split into five-minute chunks, with timestamp offsets merged afterward; boundaries may affect recognition.
- Local jobs can continue while the side panel is closed. Old jobs are cleaned on a later job start after 24 hours; at most ten recent jobs are retained.
- Long-video questions use bounded excerpts and disclose partial coverage. Transcription and AI answers may contain errors.

Page changes and YouTube access limits can break caption retrieval. A visible caption track does not guarantee it can be downloaded. This project does not fabricate access tokens or automatically export browser cookies.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Old icons or controls after updating | Reload the extension; refresh YouTube to replace the on-video buttons |
| No captions without Supadata | Wait for the video page to load; check the local helper/tools or choose a transcription fallback |
| Local Whisper is unavailable | Check local components, the selected model and the helper's registration for your actual browser |
| Environment token cannot be read | Check the private file permissions and extension ID; run the helper installer for BrowserOS/Chrome as appropriate |
| Cloud provider reports a limit | Check that provider's account; switch to available native captions or local Whisper if configured |
| Following is paused | Click Follow playback; a manual caption scroll intentionally pauses it |
| Transcription is stuck or uncertain | Check the existing task before resetting it in Settings; resetting is not cancellation and may lead to another charge |

## Privacy and data flow

- YouTube supplies existing captions or audio through your browser/local helper.
- Supadata receives the video URL when its route is used.
- Groq receives audio chunks only when selected; its key passes to the local worker in memory and is not saved in job files.
- Local Whisper processes downloaded audio on your computer.
- DeepSeek receives relevant text and context when AI features are requested.
- Eudic receives vocabulary and source sentences when you sync them.

Keys, learning records and caches stay in this browser profile or the private local-helper directory. There is no project-operated backend, analytics or automatic cross-device backup. Export vocabulary before removing local data. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Development and verification

```sh
npm ci
npm test
npm run test:native
npx playwright install chromium
npm run test:browser
npm run check
npm run package
```

The package is generated from an explicit file allowlist. Native extraction and a short local Whisper transcription were verified on macOS. Browser tests cover reader behavior, search, language settings, persistence and playback; Groq uses controlled responses until a real account key is supplied. Automated tests do not guarantee every live YouTube video or provider account will work.

Report issues in [this fork's issue tracker](https://github.com/SousekiL/caption-harbor/issues), with the browser/version and reproduction steps. Never attach keys or private learning data. Please do not send fork-specific issues to Zara's original project.

## License and acknowledgments

MIT; see [LICENSE](LICENSE). Thank you to Zara Zhang and the YouTube Digest contributors for the original foundation. Caption Harbor's modifications are maintained in this repository. Bundled fonts have their own [licenses and attribution](fonts/README.md).
