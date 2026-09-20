# Security

Caption Harbor is a personal fork of Zara Zhang's MIT-licensed YouTube Digest.

Enter all credentials only in the extension Settings page. Do not commit credentials, user transcripts, personal vocabulary exports or browser profiles. The release allowlist excludes development fixtures, node_modules, local config files and environment files.

Eudic operations and paid transcript requests are restricted to extension pages, not YouTube content scripts. Local storage uses TRUSTED_CONTEXTS. Eudic calls are serialized and paced below its documented rate limit; errors remain visible and do not trigger automatic repeated writes. Responses and selected text are treated as data. New learning cards render provider text using textContent, and citation navigation validates against the supplied transcript.

The project does not encrypt keys in local Chrome storage. Anyone with access to that profile may access them. Rotate credentials through their provider if the profile is exposed. Use provider spending limits for paid transcription. An uncertain transcription timeout is preserved rather than silently resubmitted.

Run npm test, npm run check and npm run package before publishing. Browser tests use synthetic data; do not record real credentials in screenshots or fixtures.


The optional native host supports status, Eudic-token retrieval and fixed-purpose caption/audio jobs, validates the caller origin, and rejects symlinked or non-owner-only environment files. It does not evaluate dotenv contents as shell code. The installer and native host contain no credentials and can be redistributed; `secrets.env` and the generated local host configuration must stay outside the repository. Native protocol tests use disposable credentials and browser profiles.


Audio job requests validate video IDs, provider/model allowlists and opaque task IDs. Video fetching is restricted to canonical YouTube URLs; no arbitrary URL or shell-command parameter is accepted. Groq credentials travel through stdin to a detached worker and are not put in process arguments or job files. The worker uses fixed executable names, bounded subprocess timeouts, capped source sizes, and the fixed Groq HTTPS endpoint. Local helper dependencies and models are installed explicitly. The downloader remains subject to YouTube availability and restrictions.
