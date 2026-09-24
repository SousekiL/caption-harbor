#!/usr/bin/env node
// Local release tooling only. Never bundled with the browser extension.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(os.homedir(), '.config/caption-harbor-publisher/config.json');
const ORIGIN = 'https://chromewebstore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
export class ReleaseError extends Error {}

export function readPrivateJson(filename) {
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() ||
      (process.platform !== 'win32' && ((info.mode & 0o077) || info.uid !== process.getuid())))
    throw new ReleaseError('Publishing configuration and credential files must be owner-only regular files (0600).');
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

export function validateConfig(config) {
  if (!/^[A-Za-z0-9_-]+$/.test(config.publisherId || '') || !/^[a-p]{32}$/.test(config.extensionId || ''))
    throw new ReleaseError('Invalid publisher ID or extension ID.');
  if (!path.isAbsolute(config.credentialsFile || '') || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(config.serviceAccountEmail || ''))
    throw new ReleaseError('Invalid service-account configuration.');
  if (config.authLibraryPath && !path.isAbsolute(config.authLibraryPath)) throw new ReleaseError('The optional local authentication library path must be absolute.');
  return config;
}

export function versionParts(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(version))
    throw new ReleaseError('Invalid Chrome extension version.');
  const parts = version.split('.').map(Number);
  if (parts.some(x => x > 65535) || parts.every(x => x === 0)) throw new ReleaseError('Invalid Chrome extension version.');
  while (parts.length < 4) parts.push(0);
  return parts;
}

export function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}

export function assertReady(version, status) {
  versionParts(version);
  if (status.takenDown || status.warned) throw new ReleaseError('Review the item policy status in the developer dashboard first.');
  if (['PENDING_REVIEW', 'STAGED'].includes(status.submittedItemRevisionStatus?.state))
    throw new ReleaseError('An existing submission is under review or staged. This command will not replace or cancel it.');
  if (['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(status.lastAsyncUploadState))
    throw new ReleaseError('A previous upload is still processing; check status before continuing.');
  for (const channel of status.publishedItemRevisionStatus?.distributionChannels || []) {
    if (channel.crxVersion && compareVersions(version, channel.crxVersion) <= 0)
      throw new ReleaseError(`Local version ${version} must be higher than store version ${channel.crxVersion}.`);
  }
}

export function summarize(status) {
  const revision = (value) => value ? {
    state: value.state,
    versions: (value.distributionChannels || []).map(x => x.crxVersion).filter(Boolean),
  } : null;
  return { extensionId: status.itemId, published: revision(status.publishedItemRevisionStatus),
    submitted: revision(status.submittedItemRevisionStatus), uploadState: status.lastAsyncUploadState || null,
    takenDown: !!status.takenDown, warned: !!status.warned };
}

export function createClient(config, getToken, fetchImpl = fetch, delay = ms => new Promise(r => setTimeout(r, ms))) {
  const resource = `publishers/${config.publisherId}/items/${config.extensionId}`;
  async function request(action, method = 'GET', body, contentType = 'application/json') {
    const token = await getToken();
    if (!token) throw new ReleaseError('Google authentication returned no access token.');
    const prefix = action === 'upload' ? '/upload/v2/' : '/v2/';
    let response;
    try {
      response = await fetchImpl(`${ORIGIN}${prefix}${resource}:${action}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(action === 'upload' ? 180000 : 45000),
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? {'Content-Type': contentType} : {}) },
        ...(body !== undefined ? {body} : {}),
      });
    } catch {
      throw new ReleaseError(method === 'GET' ? 'Store status request failed. Check the network.' :
        'Store request result is uncertain. Check the developer dashboard before retrying; no automatic write retry was made.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reasons = (data.error?.details || []).map(x => x.reason).filter(x => typeof x === 'string' && /^[A-Z_]+$/.test(x));
      const hint = response.status === 403 ? ' Check API enablement and service-account access in the store dashboard.' : '';
      const detail = typeof data.error?.message === 'string' ? data.error.message.split(token).join('[redacted]').slice(0, 500) : '';
      throw new ReleaseError(`Store API HTTP ${response.status}${reasons.length ? ' ('+reasons.join(', ')+')' : ''}.${hint}${detail ? ' '+detail : ''}`);
    }
    if (data.itemId && data.itemId !== config.extensionId) throw new ReleaseError('Store response returned a different extension ID.');
    if (data.name && data.name !== resource) throw new ReleaseError('Store response returned a different publisher item.');
    return data;
  }
  return {
    status: () => request('fetchStatus'),
    async upload(bytes, version) {
      const result = await request('upload', 'POST', bytes, 'application/zip');
      if (result.crxVersion && result.crxVersion !== version) throw new ReleaseError('Uploaded version did not match the local ZIP; not submitting.');
      if (['SUCCEEDED', 'UPLOAD_SUCCESS'].includes(result.uploadState)) return result;
      if (!['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(result.uploadState))
        throw new ReleaseError('The store did not confirm a successful upload; not submitting.');
      for (let attempt = 0; attempt < 12; attempt++) {
        await delay(5000);
        const status = await request('fetchStatus');
        if (['SUCCEEDED', 'UPLOAD_SUCCESS'].includes(status.lastAsyncUploadState)) return { ...result, uploadState:'SUCCEEDED', crxVersion:version };
        if (!['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(status.lastAsyncUploadState))
          throw new ReleaseError('Asynchronous upload was not successful; check the developer dashboard.');
      }
      throw new ReleaseError('Upload is still processing. Check the dashboard before submitting; no submission was made.');
    },
    submit: () => request('publish', 'POST', JSON.stringify({publishType:'DEFAULT_PUBLISH', skipReview:false, blockOnWarnings:true})),
  };
}

export async function releasePackage(client, artifact, submit = false) {
  const current = await client.status();
  assertReady(artifact.version, current);
  const uploaded = await client.upload(artifact.bytes, artifact.version);
  if (!submit) return {uploaded:true, version:artifact.version, sha256:artifact.sha256, submitted:false, uploadState:uploaded.uploadState};
  const result = await client.submit();
  return {uploaded:true, version:artifact.version, sha256:artifact.sha256, submitted:true, state:result.state};
}

function buildPackage() {
  try { execFileSync('npm', ['run', 'package'], {cwd:ROOT, stdio:'pipe', timeout:180000, maxBuffer:8*1024*1024}); }
  catch { throw new ReleaseError('Package checks failed. Run npm run package for the validation report. Nothing was uploaded.'); }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const filename = path.join(ROOT, 'dist', `caption-harbor-v${manifest.version}.zip`);
  const bytes = fs.readFileSync(filename);
  const zipped = JSON.parse(execFileSync('unzip', ['-p', filename, 'manifest.json'], {encoding:'utf8', maxBuffer:1024*1024}));
  if (zipped.name !== 'Caption Harbor' || zipped.manifest_version !== 3 || zipped.version !== manifest.version)
    throw new ReleaseError('The ZIP is not the expected desktop extension.');
  return {filename, bytes, version:zipped.version, sha256:createHash('sha256').update(bytes).digest('hex')};
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'status';
  if (argv.length > 1 || !['status','prepare','upload','release'].includes(command))
    throw new ReleaseError('Usage: node scripts/chrome-webstore.mjs [status|prepare|upload|release]');
  const config = validateConfig(readPrivateJson(CONFIG));
  const credentials = readPrivateJson(config.credentialsFile);
  if (credentials.type !== 'service_account' || credentials.client_email !== config.serviceAccountEmail)
    throw new ReleaseError('Service-account identity does not match the publishing configuration.');
  const { JWT } = await import(config.authLibraryPath ? pathToFileURL(config.authLibraryPath).href : 'google-auth-library');
  const auth = new JWT({email:credentials.client_email, key:credentials.private_key, scopes:[SCOPE], transporterOptions:{timeout:30000,retry:false}});
  const getToken = async () => {
    try { return (await auth.getAccessToken()).token; }
    catch { throw new ReleaseError('Google authentication failed. Check the service-account key, account status, and local clock.'); }
  };
  const client = createClient(config, getToken);
  const status = await client.status();
  console.log(JSON.stringify(summarize(status), null, 2));
  if (command === 'status') return;
  const local = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assertReady(local.version, status);
  console.log('Checking and building the complete desktop extension package…');
  const artifact = buildPackage();
  if (command === 'prepare') {
    console.log(JSON.stringify({filename:artifact.filename, version:artifact.version, sha256:artifact.sha256, uploaded:false, submitted:false}, null, 2));
    return;
  }
  const result = await releasePackage(client, artifact, command === 'release');
  console.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(summarize(await client.status()), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Never print library error objects, request headers, private keys, or tokens.
    console.error(error instanceof ReleaseError ? error.message : 'Local release configuration could not be read or validated. No credential details displayed.');
    process.exitCode = 1;
  });
}
