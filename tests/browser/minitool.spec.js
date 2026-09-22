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
    if(!['index.html','app.js','core.js','style.css'].includes(name)) return route.abort();
    return route.fulfill({body:fs.readFileSync(path.join(root,name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"}});
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
  await page.locator('#word-meaning').fill('同时，一次');
  await page.locator('#capture-submit').click();
  await page.locator('[data-action=note]').nth(1).click();
  await page.locator('#note-input').fill('每天做一点，积累会发生。');
  await page.locator('#capture-submit').click();
  await page.locator('[data-view=words]').click();
  await expect(page.locator('.card-title')).toHaveText('at once');
  await expect(page.locator('.card-meaning')).toHaveText('同时，一次');
  await page.locator('#export-open').click();
  await expect(page.locator('#export-text')).toHaveValue(/每天做一点/);
  await expect(page.locator('#export-text')).toHaveValue(/at once/);
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
  await expect(page.locator('img')).toHaveCount(0);
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
  await page.keyboard.press('Escape');await expect(page.locator('#modal')).toBeHidden();expect(errors).toEqual([]);
});
