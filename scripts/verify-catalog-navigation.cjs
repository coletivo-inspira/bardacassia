const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:"chromium"}); const page=await browser.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api.deezer.com/**',r=>r.abort());
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
 await page.locator('.category-tile').first().waitFor();
 await page.locator('#song-search').fill('Abba');
 await page.locator('#songs-list .song-row').first().waitFor();
 for(const width of [320,390,768,1440]) for(const theme of ['light','dark']) {
  await page.setViewportSize({width,height:900});
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.locator('#songs-list .song-row').last().scrollIntoViewIfNeeded();
  const rect=await page.locator('.spotify-search-chrome').boundingBox();
  assert(rect.y>=0&&rect.y<150,`sticky ${width} ${theme}: ${rect.y}`);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width} ${theme}`);
 }
 await page.locator('#songs-list .song-row .dj-btn').first().click();
 await page.locator('.song-recommendation').first().waitFor();
 for(const width of [320,390,768,1440]) for(const theme of ['light','dark']) {
  await page.setViewportSize({width,height:900}); await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert(await page.locator('#dj-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),`modal overflow ${width} ${theme}`);
  if([390,1440].includes(width)) await page.screenshot({path:require("node:path").join(require("node:os").tmpdir(), `bdc-review-${width}-${theme}.png`)});
 }
 await page.mouse.move(0,0); await page.locator('#dialog-song').click();
 const track=page.locator('.song-recommendations');
 await page.waitForTimeout(5600); assert(await track.evaluate(el=>el.scrollLeft)>0,'auto advance');
 await page.locator('[data-recommendation="pause"]').click();
 assert.equal(await page.locator('[data-recommendation="pause"]').textContent(),'Retomar');
 const title=await page.locator('.song-recommendation strong').first().textContent();
 await page.locator('.song-recommendation').first().click();
 assert((await page.locator('#dialog-song').textContent()).includes(title));
 await page.locator('.song-recommendation').first().waitFor();
 await page.locator('.dialog-close').first().click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#songs-list .song-row .dj-btn').first().click();
 await page.locator('.song-recommendation').first().waitFor();
 assert.equal(await page.locator('[data-recommendation="pause"]').textContent(),'Retomar');
 await page.locator('.dialog-close').first().click();
 await page.setViewportSize({width:390,height:900});
 await page.locator('.island-account-trigger').click();
 assert.equal(await page.locator('#island-account-list [data-action="login"] svg').count(),1);
 // The carousel remains usable when covers are unavailable.
 await page.locator('.island-account-trigger').click();
 await page.route('**/data/song-covers.json',r=>r.fulfill({json:{}}));
 await page.reload();
 await page.locator('#song-search').fill('Abba');
 await page.locator('#songs-list .dj-btn').first().click();
 await page.locator('.song-recommendation').first().waitFor();
 assert(await page.locator('.recommendation-cover .cover-fallback').count()>0);
 await page.locator('.dialog-close').first().click();
 await page.route('**/data/song-connections.json',r=>r.fulfill({json:{}}));
 await page.reload();
 await page.locator('#song-search').fill('Abba');
 await page.locator('#songs-list .dj-btn').first().click();
 await page.waitForTimeout(300);
 assert(await page.locator('#dialog-related').isHidden());
 assert.deepEqual(errors,[]);
 console.log('PASS: 8 viewport/theme combinations, sticky catalog, recommendation layout/advance/pause/navigation/reduced motion, account icon');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

