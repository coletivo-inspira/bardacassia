const {chromium, webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{for(const [name,type] of Object.entries({chromium,webkit})) {
 let browser; try {browser=await type.launch({headless:true});} catch(e){throw e;}
 const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 await page.route('**/api.deezer.com/**',r=>r.abort()); await page.route('**/api/deezer/**',r=>r.abort());
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173'); await page.locator('.category-tile').first().waitFor();
 for(const width of [320,390,430,768]) for(const theme of ['light','dark']) {
 await page.setViewportSize({width,height:844}); await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${name} ${width} ${theme}`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#toggle-filters').click(); await page.locator('#filter-language').selectOption('BRA');
 assert(await page.locator('#catalog-filters').isHidden());
 assert.equal(await page.locator('#toggle-filters').getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#toggle-filters').textContent(),'Filtros (1)');
 await page.locator('#toggle-filters').click();
 await page.locator('#filter-artist-search').fill('marilia'); await page.locator('#filter-artist').selectOption({label:'Marília Mendonça'});
 assert(await page.locator('#catalog-filters').isHidden());
 assert.equal(await page.locator('#toggle-filters').textContent(),'Filtros (2)');
 await page.locator('#song-search').fill('infiel'); await page.waitForTimeout(400);
 assert((await page.locator('#results-count').textContent()).includes('encontrada'));
 await page.locator('#clear-search').click(); assert.equal(await page.locator('#filter-language').inputValue(),'BRA');
 await page.locator('#song-search').fill('infiel'); await page.waitForTimeout(300);
 await page.locator('#toggle-filters').click(); await page.locator('#clear-filters').click();
 assert.equal(await page.locator('#song-search').inputValue(),'infiel');
 assert.equal(await page.locator('#toggle-filters').textContent(),'Filtros');
 assert(await page.locator('#catalog-filters').isHidden());
 await page.locator('#toggle-filters').click(); await page.locator('#filter-favorites').check();
 assert(await page.locator('#catalog-filters').isHidden());
 assert.equal(await page.locator('#songs-list').locator('.song-row').count(),0); assert.equal(await page.locator('.search-suggestion').filter({hasText:'Infiel'}).count(),0);
 await page.locator('#toggle-filters').click(); await page.locator('#clear-filters').click(); await page.locator('#clear-search').click();
 assert.equal(await page.locator('#toggle-filters').textContent(),'Filtros');
 await page.emulateMedia({reducedMotion:'reduce'}); assert((await page.locator('.hero-artwork img').evaluate(el=>el.currentSrc)).endsWith('logo_bar_da_cacia_animada.svg'));
 assert((await page.locator('.brand img').getAttribute('src')).endsWith('logo_bar_da_cacia.svg'));
 
 assert.deepEqual(errors,[]);console.log(name+': themes/widths, filters, suggestions, logo, runtime PASS');await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
