# Security

Caption Harbor is a personal fork of Zara Zhang's MIT-licensed YouTube Digest.

Enter all credentials only in the extension Settings page. Do not commit credentials, user transcripts, personal vocabulary exports or browser profiles. The release allowlist excludes development fixtures, node_modules, local config files and environment files.

Eudic operations and paid transcript requests are restricted to extension pages, not YouTube content scripts. Local storage uses TRUSTED_CONTEXTS. Eudic calls are serialized and paced below its documented rate limit; errors remain visible and do not trigger automatic repeated writes. Responses and selected text are treated as data. New learning cards render provider text using textContent, and citation navigation validates against the supplied transcript.

The project does not encrypt keys in local Chrome storage. Anyone with access to that profile may access them. Rotate credentials through their provider if the profile is exposed. Use provider spending limits for paid transcription. An uncertain transcription timeout is preserved rather than silently resubmitted.

Run npm test, npm run check and npm run package before publishing. Browser tests use synthetic data; do not record real credentials in screenshots or fixtures.
