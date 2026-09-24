const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../minitool/core.js');

test('mini-tool parses millisecond SRT cues and bilingual multiline content', () => {
  assert.deepEqual(core.parse('1\n00:01:02,125 --> 00:01:05,000\nSmall steps.\n每天一点点。'), [{start:62.125,text:'Small steps.\n每天一点点。'}]);
});
test('mini-tool parses VTT cue IDs, settings and skips annotations', () => {
  assert.deepEqual(core.parse('WEBVTT\n\nNOTE internal\nignore me\n\nid-1\n00:01.500 --> 00:03.000 align:start\n<v A>Hello &amp; welcome.</v>'), [{start:1.5,text:'Hello & welcome.'}]);
});
test('mini-tool rejects bad ranges, empty input and oversized imports without truncation', () => {
  for(const raw of ['', '1\n00:00:03,000 --> 00:00:02,000\nTest', '1\n00:99:00,000 --> 00:99:03,000\nTest', 'a'.repeat(50001), Array(802).fill('Test.').join('\n')]) assert.throws(()=>core.parse(raw));
});
test('mini-tool handles plain text and timestamped pasted lines', () => {
  assert.deepEqual(core.parse('First sentence. Second sentence!\n[1:23] One more.'), [{text:'First sentence.',start:null},{text:'Second sentence!',start:null},{text:'One more.',start:83}]);
  assert.equal(core.clock(3661.7),'1:01:01');
  assert.equal(core.clock(null),'');
});
test('mini-tool validates persisted records and rejects malformed collection data', () => {
  const state={version:1,active:'a',docs:[{id:'a',title:'Title',read:[0,0],cues:[{text:'a',start:0}]}],words:[{id:'w',docId:'a',title:'Title',context:'Example.',text:'example',created:'2026-09-23T00:00:00.000Z',pronunciation:'/ɪɡˈzɑːmpəl/',partOfSpeech:'n.',meaning:'例子',example:'This is an example.'}],notes:[]};
  assert.deepEqual(core.validate(state).docs[0].read,[0]);
  assert.equal(core.validate(state).words[0].partOfSpeech,'n.');
  assert.throws(()=>core.validate({...state,words:[{...state.words[0],pronunciation:42}]}));
  assert.throws(()=>core.validate({version:1,docs:[],words:[{}],notes:[]}));
});
test('mini-tool ships only offline classic scripts with no prohibited APIs', () => {
  const root=path.resolve(__dirname,'../minitool');
  const files=fs.readdirSync(root);
  assert.deepEqual(files.sort(),['app.js','ch.svg','core.js','index.html','style.css']);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const js=files.filter(f=>f.endsWith('.js')).map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
  assert.doesNotMatch(html,/<(?:iframe|object|base)\b|type=["']module|\son\w+=|javascript:|http-equiv|\bdownload\b|target=["']_blank/i);
  assert.doesNotMatch(html,/<a\b[^>]*href=["']https?:/i);
  assert.match(html,/Chrome 应用商店地址/);
  assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection|navigator\.(?:clipboard|geolocation|serviceWorker|locks)|execCommand|new\s+(?:Worker|SharedWorker|Function)|\beval\s*\(|WebAssembly|window\.(?:open|prompt)\s*\(|chrome\./);
  assert.doesNotMatch(js,/\?\.|\?\?|\.replaceAll\(|\.at\(|Object\.hasOwn|structuredClone|\p\{/);
  for(const match of html.matchAll(/<(script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)) {assert.ok(match[2].startsWith('./')); assert.ok(fs.existsSync(path.join(root,match[2])));}
});
