const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const api = import('../scripts/chrome-webstore.mjs');
const config = {publisherId:'publisher-fixture', extensionId:'a'.repeat(32), credentialsFile:'/private/fixture.json', serviceAccountEmail:'fixture@test.iam.gserviceaccount.com'};
const published = { itemId:config.extensionId, publishedItemRevisionStatus:{state:'PUBLISHED',distributionChannels:[{crxVersion:'2.1.9'}]} };
const reply = body => ({ok:true,status:200,json:async()=>body});

test('store release compares numeric versions and blocks active reviews', async () => {
  const {compareVersions, assertReady} = await api;
  assert.equal(compareVersions('2.1.10','2.1.9'),1);
  assert.equal(compareVersions('2.1.9.0','2.1.9'),0);
  assert.throws(()=>assertReady('2.1.9',published),/must be higher/);
  assert.throws(()=>assertReady('2.1.10',{...published,submittedItemRevisionStatus:{state:'PENDING_REVIEW'}}),/existing submission/);
  assert.throws(()=>assertReady('2.1.10',{...published,submittedItemRevisionStatus:{state:'STAGED'}}),/existing submission/);
  assert.throws(()=>assertReady('2.1.10',{...published,lastAsyncUploadState:'IN_PROGRESS'}),/still processing/);
  assert.throws(()=>compareVersions('2.01.9','2.1.9'),/Invalid/);
  assert.throws(()=>compareVersions('70000.0','2.1'),/Invalid/);
  assertReady('2.1.10',published);
});

test('store credentials require private permissions, a regular file and explicit account identity', async () => {
  const {readPrivateJson,validateConfig} = await api;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-publisher-test-'));
  try {
    const filename=path.join(dir,'config.json');
    fs.writeFileSync(filename,JSON.stringify(config),{mode:0o600});
    assert.deepEqual(readPrivateJson(filename),config);
    if(process.platform!=='win32') {
      fs.chmodSync(filename,0o644);
      assert.throws(()=>readPrivateJson(filename),/owner-only/);
      fs.chmodSync(filename,0o600);
      fs.symlinkSync(filename,path.join(dir,'link'));
      assert.throws(()=>readPrivateJson(path.join(dir,'link')),/owner-only/);
    }
    assert.throws(()=>validateConfig({...config,publisherId:'../wrong'}),/Invalid/);
    assert.throws(()=>validateConfig({...config,credentialsFile:'relative.json'}),/Invalid/);
    assert.throws(()=>validateConfig({...config,authLibraryPath:'relative.js'}),/must be absolute/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('status is read-only and never exposes authentication or public-key payloads', async () => {
  const {createClient,summarize} = await api;
  const requests=[];
  const client=createClient(config,async()=>'fixture-token',async(url,options)=>{
    requests.push({url,options});
    return reply({...published,publicKey:'unused-key',extra:'unused'});
  });
  const result=summarize(await client.status());
  assert.equal(requests[0].options.method,'GET');
  assert.equal(requests[0].options.body,undefined);
  assert.match(requests[0].url,/^https:\/\/chromewebstore\.googleapis\.com\/v2\/publishers\/publisher-fixture\/items\/a{32}:fetchStatus$/);
  assert.equal(result.published.versions[0],'2.1.9');
  assert.ok(!JSON.stringify(result).includes('fixture-token'));
  assert.ok(!JSON.stringify(result).includes('unused-key'));
});

test('upload polls asynchronous processing and submission explicitly keeps Google review', async () => {
  const {createClient,releasePackage} = await api;
  const calls=[]; let polls=0;
  const client=createClient(config,async()=>'fixture-token',async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith(':upload'))return reply({itemId:config.extensionId,uploadState:'IN_PROGRESS'});
    if(url.endsWith(':publish'))return reply({itemId:config.extensionId,state:'PENDING_REVIEW'});
    polls++;
    return reply({...published,lastAsyncUploadState:polls===1?'NOT_FOUND':'SUCCEEDED'});
  },async()=>{});
  const result=await releasePackage(client,{bytes:Buffer.from('fixture'),version:'2.1.10',sha256:'fixture-hash'},true);
  assert.equal(result.submitted,true);
  assert.equal(result.state,'PENDING_REVIEW');
  assert.deepEqual(calls.map(x=>x.options.method),['GET','POST','GET','POST']);
  const submission=JSON.parse(calls[3].options.body);
  assert.equal(submission.skipReview,false);
  assert.equal(submission.blockOnWarnings,true);
  assert.equal(submission.publishType,'DEFAULT_PUBLISH');
});

test('upload-only never submits and failed or uncertain upload never retries a write', async () => {
  const {createClient,releasePackage} = await api;
  for (const mode of ['success','failed','uncertain']) {
    const writes=[];
    const client=createClient(config,async()=>'fixture-token',async(url,options)=>{
      if(options.method==='GET')return reply(published);
      writes.push(url);
      if(mode==='uncertain')throw new Error('fixture transport failure');
      return reply({uploadState:mode==='success'?'SUCCEEDED':'FAILED',crxVersion:'2.1.10'});
    });
    const task=releasePackage(client,{bytes:Buffer.from('fixture'),version:'2.1.10',sha256:'fixture-hash'},mode!=='success');
    if(mode==='success')assert.equal((await task).submitted,false);
    else await assert.rejects(task,/not confirm|uncertain/);
    assert.equal(writes.length,1);
    assert.ok(writes[0].endsWith(':upload'));
  }
});

test('store client rejects a mismatched item or upload version and redacts echoed tokens', async () => {
  const {createClient} = await api;
  const wrong=createClient(config,async()=>'fixture-token',async()=>reply({itemId:'b'.repeat(32)}));
  await assert.rejects(wrong.status(),/different extension/);
  const version=createClient(config,async()=>'fixture-token',async()=>reply({uploadState:'SUCCEEDED',crxVersion:'9.0.0'}));
  await assert.rejects(version.upload(Buffer.from('fixture'),'2.1.10'),/did not match/);
  const denied=createClient(config,async()=>'fixture-token',async()=>({ok:false,status:403,json:async()=>({error:{message:'denied fixture-token',details:[{reason:'PERMISSION_DENIED'}]}})}));
  await assert.rejects(denied.status(),error=>error.message.includes('HTTP 403') && !error.message.includes('fixture-token'));
});
