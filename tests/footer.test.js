import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FOOTER_PAGES = ["index.html", "evento.html", "o-bar.html", "favoritos.html", "conta.html"];

for (const page of FOOTER_PAGES) {
  test(`${page} footer carries the Coletivo Inspira copyright`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const footer = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[1];
    assert.ok(footer, "site footer not found");
    assert.doesNotMatch(footer, /footer-nav/);
    assert.match(footer, /class="site-instagram footer-instagram theme-toggle"/);
    assert.match(footer, /©\s*<span data-current-year>\d{4}<\/span>/);
    assert.match(footer, /<a href="https:\/\/inspira\.dev\.br\/"[^>]*>Coletivo Inspira<\/a>\.\s*Todos os direitos reservados\./);
  });

  // The github.io URL redirects to plain http, which browsers block as mixed content.
  test(`${page} loads the +INSPIRA orb straight from the HTTPS brand book`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const src = html.match(/<script[^>]*src="([^"]*inspira-orb\.js)"/)?.[1];
    assert.equal(src, "https://brandbook.inspira.dev.br/assets/js/inspira-orb.js");
  });

  test(`${page} mounts the +INSPIRA orb in the footer, just above the copyright`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const script = html.match(/<script[^>]*inspira-orb\.js[^>]*>/)?.[0] || "";
    assert.match(script, /data-mount="\[data-inspira-orb-mount\]"/);
    const footer = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[1] || "";
    assert.equal((html.match(/data-inspira-orb-mount/g) || []).length, 2, "one mount point plus the script selector");
    assert.match(footer, /<div class="footer-orb" data-inspira-orb-mount><\/div>\s*<p class="footer-copy">/);
  });
}

test("the +INSPIRA orb no longer floats in the mobile dock", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /glass-island ~ a\.inspira-orb/);
  assert.doesNotMatch(css, /--dock-orb/);
  assert.match(css, /\.footer-orb a\.inspira-orb \{ margin: 0; \}/);
});
