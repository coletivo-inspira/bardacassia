const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{for(const [name,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch(); const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api.deezer.com/**',r=>r.abort()); await page.route('**/api/deezer/**',r=>r.abort());
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');await page.locator('#open-discover').click();assert.equal(await page.locator('#confirm-genres').isDisabled(),true);await page.locator('.genre-chip').first().click();await page.locator('#confirm-genres').click();await page.locator('#skip-artist-picker').click();
 await page.locator('#discovery-card h4').waitFor();const title=await page.locator('#discovery-card h4').textContent();
 await page.locator('#choose-song').dblclick();await page.waitForTimeout(300);assert.equal(await page.locator('#favorites-count').textContent(),'1');
 await page.locator('#undo-discovery').click();assert.equal(await page.locator('#favorites-count').textContent(),'0');assert.equal(await page.locator('#discovery-card h4').textContent(),title);
 await page.locator('#discovery-card').scrollIntoViewIfNeeded();const box=await page.locator('#discovery-card').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+70);await page.mouse.down();await page.mouse.move(box.x+box.width/2+110,box.y+72,{steps:8});await page.mouse.up();await page.waitForTimeout(300);assert.equal(await page.locator('#favorites-count').textContent(),'1');
 await page.reload(); await page.locator('#open-discover').waitFor();await page.waitForFunction(()=>document.querySelector('#favorites-count').textContent==='1');assert.equal(await page.locator('#favorites-count').textContent(),'1');
 await page.locator('#song-search').fill('infiel');await page.waitForTimeout(400);await page.locator('#search-suggestions button').first().click();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value;}}}));
 await page.locator('#copy-song-code').click();assert.equal(await page.locator('#copy-song-code').textContent(),'Copiado!');assert.equal(await page.evaluate(()=>window.copied),await page.locator('#dialog-code').textContent());
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}}));await page.locator('#copy-song-code').click();assert((await page.locator('#copy-code-status').textContent()).includes('manualmente'));await page.locator('.dialog-done').click();
 await page.locator('#show-favorites').click();page.once('dialog',d=>d.accept());await page.locator('#clear-favorite-tab').click();assert.equal(await page.locator('#favorites-count').textContent(),'0');
 assert.deepEqual(errors,[]);
 const blocked=await browser.newPage();await blocked.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('blocked')};Storage.prototype.getItem=()=>{throw Error('blocked')};});await blocked.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');await blocked.locator('#open-discover').click();await blocked.locator('.genre-chip').first().click();await blocked.locator('#confirm-genres').click();await blocked.locator('#skip-artist-picker').click();assert((await blocked.locator('#spotify-status').textContent()).includes('continuar'));
 const login=await browser.newPage({viewport:{width:390,height:844}});const loginErrors=[];login.on('pageerror',e=>loginErrors.push(e.message));
 await login.goto(new URL('login.html?next=https://evil.example',process.env.TEST_URL || 'http://127.0.0.1:5173/').href);await login.locator('#auth-title').waitFor();
 assert.equal(await login.locator('#auth-title').textContent(),'Entrar');assert.equal(await login.locator('#auth-submit').isDisabled(),true);
 await login.locator('a[href="#cadastrar"]').click();await login.locator('#auth-card[data-mode="cadastrar"]').waitFor();assert.equal(await login.locator('#auth-title').textContent(),'Cadastrar');assert.equal(await login.locator('#auth-name').isVisible(),true);
 await login.locator('a[href="#entrar"]:visible').first().click();await login.locator('#auth-card[data-mode="entrar"]').waitFor();assert.equal(await login.locator('#auth-name').isVisible(),false);
 if(await login.locator('#auth-unavailable').isHidden()){
  await login.locator('#auth-email').fill('a@b');await login.locator('#auth-email').blur();assert((await login.locator('#auth-email-error').textContent()).includes('válido'));
  await login.locator('#auth-email').fill('cacia@bar.com');await login.locator('#auth-password').fill('x');assert.equal(await login.locator('#auth-submit').isDisabled(),false);
  await login.locator('#auth-toggle-password').click();assert.equal(await login.locator('#auth-password').getAttribute('type'),'text');
 }
 assert.deepEqual(loginErrors,[]);
 console.log(name+': styles required, swipe, double click, undo, reload, clipboard success/failure, reset, blocked storage, login modes PASS');await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
