import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FOOTER_PAGES = ["index.html", "evento.html", "o-bar.html"];

for (const page of FOOTER_PAGES) {
  test(`${page} footer carries the Coletivo Inspira copyright`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const footer = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[1];
    assert.ok(footer, "site footer not found");
    assert.doesNotMatch(footer, /footer-nav/);
    assert.match(footer, /©\s*<span data-current-year>\d{4}<\/span>/);
    assert.match(footer, /<a href="https:\/\/inspira\.dev\.br\/"[^>]*>Coletivo Inspira<\/a>\.\s*Todos os direitos reservados\./);
  });
}
