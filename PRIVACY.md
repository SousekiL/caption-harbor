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
