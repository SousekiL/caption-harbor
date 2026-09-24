# Chrome Web Store release commands

This is local developer tooling; it is not bundled with the browser extension.

The local publisher configuration lives at `~/.config/caption-harbor-publisher/config.json`. It names the publisher ID, store extension ID, service-account email and an absolute path to the service-account JSON. Both files must be owner-only regular files (0600). Keep their directory private (0700), outside this repository. Do not paste private keys or access tokens into commands or chat.

For cloud-synced workspaces, `authLibraryPath` can optionally point to a local installation of the same official `google-auth-library` package. If omitted, the repository's dev dependency is used. This avoids waiting for cloud hydration of dependencies; it does not change the credential source or upload destination.

## Commands

Run from the repository:

```sh
npm run store:status
npm run store:prepare
npm run store:upload
npm run store:release
```

- `store:status` authenticates and reads current store status. It does not upload or submit anything.
- `store:prepare` checks the local version against published versions, then runs the existing release checks and builds a ZIP. It does not change the store.
- `store:upload` builds and uploads the complete desktop extension ZIP, but does not submit it for review.
- `store:release` builds, uploads, waits for upload processing and submits for review. On approval Google publishes the revision using the item's current distribution settings. Run this only when the version is ready to ship.

Increase `manifest.json`, `package.json` and `package-lock.json` versions before a new store release. Existing pending reviews/staged submissions are not automatically cancelled. Failed or uncertain uploads are never automatically repeated. No private-key or access-token values are printed or persisted by the publisher tool.

## Setup and troubleshooting

Use Google's service-account setup to enable Chrome Web Store API and link the service-account email under the store Developer Dashboard's Account section. The configured Publisher ID must own the chosen extension. Successful Google authentication alone does not prove store authorization; verify with `store:status` first.

An HTTP 403 from the store requires checking API enablement, the service-account binding, selected publisher and extension ID. If you have just saved the binding, retry status after the permission change has propagated. Do not keep generating service-account keys to resolve an ownership mismatch.

This configuration does not alter browser installation IDs or native-helper credentials. It also does not create a GitHub Actions publishing job or send this private key to GitHub.

Official references: [service accounts](https://developer.chrome.com/docs/webstore/service-accounts), [API](https://developer.chrome.com/docs/webstore/using-api), [update lifecycle](https://developer.chrome.com/docs/webstore/update).
