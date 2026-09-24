const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=process.env.CAPTION_HARBOR_MINITOOL_ROOT || path.resolve(__dirname,'../../minitool');
const errors=[];
async function start(page) {
  errors.length=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*', route=>{
    const u=new URL(route.request().url());
    if(u.origin!=='https://mini.test') throw new Error('Unexpected external request: '+u.origin);
    const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
    if(!['index.html','app.js','core.js','style.css','ch.svg'].includes(name)) return route.abort();
    return route.fulfill({body:fs.readFileSync(path.join(root,name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"}});
  });
  await page.goto('https://mini.test/');
  await expect(page.locator('#cue-count')).toHaveText('6');
}
test('offline mini-tool reads, collects, notes, exports and persists under restrictive CSP', async ({page})=>{
  await page.setViewportSize({width:390,height:844}); await start(page);
  await page.locator('[data-action=read]').first().click();
  await expect(page.locator('#read-count')).toHaveText('1');
  await page.locator('[data-action=word]').first().click();
  await page.locator('#word-input').fill('at once');
  await page.locator('#word-pronunciation').fill('/ət wʌns/');
  await page.locator('#word-part-of-speech').fill('phrase');
  await page.locator('#word-meaning').fill('同时，一次');
  await expect(page.locator('#word-example')).toHaveValue(/不必一次学会所有事情/);
  await page.locator('#word-example').fill('You do not need to learn everything at once.');
  await page.locator('#capture-submit').click();
  await page.locator('[data-action=note]').nth(1).click();
  await page.locator('#note-input').fill('每天做一点，积累会发生。');
  await page.locator('#capture-submit').click();
  await page.locator('[data-view=words]').click();
  await expect(page.locator('.card-title')).toHaveText('at once');
  await expect(page.locator('.dictionary-pronunciation')).toHaveText('/ət wʌns/');
  await expect(page.locator('.dictionary-pos')).toHaveText('phrase');
  await expect(page.locator('.card-meaning')).toHaveText('同时，一次');
  await expect(page.locator('.card-example')).toContainText('我的例句');
  await page.screenshot({path:'test-results/minitool-v1.1.0-dictionary.png',fullPage:true,animations:'disabled'});
  await page.locator('#export-open').click();
  await expect(page.locator('#export-text')).toHaveValue(/每天做一点/);
  await expect(page.locator('#export-text')).toHaveValue(/at once/);
  await expect(page.locator('#export-text')).toHaveValue(/音标：\/ət wʌns\//);
  await expect(page.locator('#export-text')).toHaveValue(/词性：phrase/);
  await page.locator('#select-export').click();
  expect(await page.locator('#export-text').evaluate(e=>e.selectionEnd-e.selectionStart)).toBeGreaterThan(10);
  await page.locator('#close-modal').click(); await page.reload();
  await expect(page.locator('#read-count')).toHaveText('1');
  await expect(page.locator('#saved-count')).toHaveText('2');
  expect(errors).toEqual([]);
});
test('mini-tool imports timed text, paginates and searches without rendering HTML', async ({page})=>{
  await start(page); await page.locator('#import-open').click();
  await page.locator('#import-title').fill('Imported');
  const raw=Array.from({length:55},(_,i)=>`[${Math.floor(i/60)}:${String(i%60).padStart(2,'0')}] Caption ${i} <img src=x onerror=alert(1)>`).join('\n');
  await page.locator('#import-text').fill(raw);await page.locator('#import-submit').click();
  await expect(page.locator('.card')).toHaveCount(20);
  await expect(page.locator('#cue-count')).toHaveText('55');
  await page.locator('#next-page').click(); await expect(page.locator('#page-label')).toHaveText('2 / 3');
  await page.locator('#search').fill('Caption 54');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('0:54');
  await expect(page.locator('#list img')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('mini-tool invalid imports preserve the existing document and show a useful error',async({page})=>{
  await start(page);await page.locator('#import-open').click();
  await page.locator('#import-text').fill('1\n00:00:03,000 --> 00:00:02,000\nInvalid');
  await page.locator('#import-submit').click();
  await expect(page.locator('#dialog-error')).toContainText('结束时间');
  await page.locator('#close-modal').click();await expect(page.locator('#cue-count')).toHaveText('6');
  expect(errors).toEqual([]);
});
test('mini-tool storage denial degrades to memory with a visible persistence warning',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('quota');};});
  await start(page);await page.locator('[data-action=read]').first().click();
  await expect(page.locator('#storage-warning')).toContainText('仅在本次打开期间保留');
  await expect(page.locator('#read-count')).toHaveText('1');expect(errors).toEqual([]);
});
test('mini-tool stays within mobile and desktop widths and supports keyboard dismissal',async({page})=>{
  await start(page);
  for(const width of [320,390,768,1100]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/minitool-mobile.png',fullPage:true});
  await page.locator('#about-open').click();await expect(page.locator('#about-panel')).toContainText('不联网');
  await expect(page.locator('#store-url')).toHaveValue('https://chromewebstore.google.com/detail/caption-harbor/kopjchpnhjdekbjljikkjcebojcalmil');
  await page.locator('#select-store-url').click();
  expect(await page.locator('#store-url').evaluate(e=>e.selectionEnd-e.selectionStart)).toBeGreaterThan(60);
  await page.locator('.sheet').screenshot({path:'test-results/minitool-v1.1.0-about.png',animations:'disabled'});
  await page.keyboard.press('Escape');await expect(page.locator('#modal')).toBeHidden();expect(errors).toEqual([]);
});

test('subtitle demos open word and concept explanations, switch language and collect results',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await start(page);
  await expect(page.locator('.demo-term')).toHaveCount(6);
  await expect(page.locator('#demo-hint')).toBeVisible();
  await page.locator('#list .card').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/minitool-v1.2.0-subtitles.png',animations:'disabled'});
  await page.getByRole('button',{name:'查词义：at once',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.locator('.demo-label')).toContainText('非实时 AI');
  await expect(dialog.locator('.dictionary-pos')).toHaveText('phrase');
  await expect(dialog.locator('.lookup-definition')).toContainText('同时');
  await dialog.locator('[data-explanation=en]').click();
  await expect(dialog.locator('.lookup-definition')).toContainText('All at the same time');
  await expect(dialog.locator('.lookup-translation')).toHaveCount(0);
  await dialog.locator('[data-explanation=zh]').click();
  await dialog.screenshot({path:'test-results/minitool-v1.2.0-word.png',animations:'disabled'});
  await page.locator('#lookup-save').click();
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#saved-count')).toHaveText('1');
  await page.getByRole('button',{name:'概念解释',exact:true}).first().click();
  await expect(dialog.locator('.lookup-definition')).toContainText('分步学习');
  await dialog.screenshot({path:'test-results/minitool-v1.2.0-concept.png',animations:'disabled'});
  await page.locator('#lookup-save').click();
  await expect(page.locator('#saved-count')).toHaveText('2');
  await page.locator('[data-view=words]').click();
  await expect(page.locator('.card-title')).toHaveText('at once');
  await expect(page.locator('.card-meaning')).toContainText('同时');
  await page.locator('[data-view=notes]').click();
  await expect(page.locator('#list')).toContainText('把学习任务拆小');
  await page.reload();
  await expect(page.locator('#saved-count')).toHaveText('2');
  expect(errors).toEqual([]);
});

test('unlisted imported captions do not claim to offer AI lookup and closing demos clears selection',async({page})=>{
  await start(page);
  await page.locator('.demo-term').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate(()=>getSelection().toString())).toBe('');
  await page.locator('#import-open').click();
  await page.locator('#import-text').fill('A completely different sentence about mountains.');
  await page.locator('#import-submit').click();
  await expect(page.locator('.lookup-actions')).toHaveCount(0);
  await expect(page.locator('#demo-hint')).toBeHidden();
  await expect(page.locator('[data-action=word]')).toBeVisible();
  await page.locator('#demo-open').click();
  await expect(page.locator('#lookup-panel')).toBeVisible();
  await expect(page.locator('.lookup-headword')).toHaveText('at once');
  expect(errors).toEqual([]);
});
