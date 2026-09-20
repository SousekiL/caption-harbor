# Caption Harbor privacy

Caption Harbor is an MIT-licensed fork of YouTube Digest. It has no developer-operated server, telemetry, ads or analytics.

## Data destinations

- `api.supadata.ai`: canonical public YouTube watch URL, preferred language and transcript mode, authenticated with your Supadata key. With automatic transcription enabled (default), the provider obtains and processes video audio when native captions are missing. Disable this in the learning settings for native-only mode.
- `api.deepseek.com`: selected text, relevant transcript excerpts, video metadata, user questions or notes when you invoke AI features. Long question context is bounded; the UI states when only excerpts were sent. Uses the existing DeepSeek V4 Flash integration.
- `api.frdic.com`: Eudic authorization, wordbook operations, selected word or phrase and its source sentence when you connect or request synchronization. Eudic never receives your Supadata or AI key. AI services never receive your Eudic token.

Provider processing and retention follow their respective terms. Imports are parsed locally; invoking translation or AI on imported text sends the relevant content to DeepSeek.

## Local data

Chrome extension local storage holds keys, settings, notes, vocabulary, source occurrences, history, recent transcript caches, pending transcription job identifiers and Eudic synchronization state. Storage access is restricted to trusted extension pages; content scripts do not read keys. Keys are not separately encrypted by the project. Exported CSV/Markdown contains vocabulary and source URLs, not credentials.

Uninstalling the extension may remove local data. Clearing local words leaves Eudic copies intact. Cached transcripts may be evicted by the upstream cache policy. Learning history and vocabulary remain until deleted or the extension's local data is cleared. No automatic cross-device backup is provided.

## Permissions

`sidePanel` displays the learning panel; `tabs` identifies the active YouTube video; `scripting` supports the inherited player integration; `storage` persists local learning state. Host permissions cover YouTube, Supadata, DeepSeek and Eudic only. No microphone permission, browsing-history permission or all-sites permission is requested.

## Optional environment bridge

The `nativeMessaging` permission permits communication with `com.caption_harbor.environment`. In environment mode, the Eudic token comes from the native process environment or an owner-only `~/.config/caption-harbor/secrets.env` file. It is not persisted in Chrome storage. Only the background Eudic request uses it; settings receive a configured/not-configured status rather than the token. Selecting this mode clears a previous manually stored Eudic token when settings are saved. Supadata and DeepSeek settings are unchanged. The helper accepts only the explicitly registered extension origin; fixed-purpose audio operations are described below.

## Version 2.1 caption and audio providers

The extension first reads captions available to the current YouTube page. It may open the page's built-in transcript view. If the local helper is installed, yt-dlp can retrieve captions or public video audio directly from YouTube. This does not send data to Supadata. No browser cookies are exported automatically.

The native helper now supports fixed-purpose audio jobs in addition to Eudic credentials. With local Whisper, audio is processed on this computer. With Groq, the local worker sends audio chunks and the Groq key to `api.groq.com`; keys pass through process memory/stdin and are not persisted in job files. Supadata remains an optional cloud provider. AI interpretation and translation still use DeepSeek independently.

Temporary audio, caption files and job status live under the private application directory. Old jobs are cleaned when a new job starts after 24 hours. Models are downloaded separately and retained for reuse. Interface-language preferences are stored locally and shared between Settings and the panel; they do not modify the selected caption-content language.
