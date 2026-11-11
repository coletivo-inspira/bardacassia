import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOGO_PALETTE,
  PALETTE_THEMES,
  PALETTE_TOKENS,
  applyPalette,
  isHexColor,
  mergePalette,
  paletteStyleMap,
} from "../src/lib/palette.js";

const PAGES = [
  "index.html",
  "login.html",
  "conta.html",
  "favoritos.html",
  "evento.html",
  "o-bar.html",
  "cartaz.html",
  "garcom.html",
  "gerente.html",
  "admin.html",
];

test("merge keeps logo defaults when remote is empty or invalid", () => {
  assert.deepEqual(mergePalette(null), LOGO_PALETTE);
  assert.deepEqual(mergePalette(undefined), LOGO_PALETTE);
  assert.deepEqual(mergePalette({}), LOGO_PALETTE);
  assert.deepEqual(mergePalette([]), LOGO_PALETTE);
  assert.deepEqual(mergePalette("cores"), LOGO_PALETTE);
  assert.deepEqual(mergePalette({ dark: null, light: [] }), LOGO_PALETTE);
  assert.equal(mergePalette({}).dark.amber, "#e6c34a");
  assert.equal(mergePalette({}).light.bg, "#f7f1e1");
  assert.equal(mergePalette({}).light.amber, "#8a6a12");
  assert.equal(mergePalette({}).light.sky, "#1d6f8a");
});

test("valid hex overrides one token and drops unknown keys", () => {
  const merged = mergePalette({
    dark: { bg: "#112233", extra: "#abcdef" },
    light: { sky: "#ABCDEF" },
    blue: { bg: "#000000" },
  });
  assert.equal(merged.dark.bg, "#112233");
  assert.equal(merged.dark.amber, LOGO_PALETTE.dark.amber);
  assert.equal(merged.dark.sky, LOGO_PALETTE.dark.sky);
  assert.equal(merged.light.sky, "#abcdef");
  assert.equal(merged.light.bg, LOGO_PALETTE.light.bg);
  assert.equal(merged.blue, undefined);
  assert.equal(merged.dark.extra, undefined);
});

test("invalid hex is rejected and the logo color stays", () => {
  assert.equal(isHexColor("#e6c34a"), true);
  assert.equal(isHexColor("#E6C34A"), true);
  assert.equal(isHexColor("#fff"), false);
  assert.equal(isHexColor("#e6c34aee"), false);
  assert.equal(isHexColor("e6c34a"), false);
  assert.equal(isHexColor("#gghhii"), false);
  const merged = mergePalette({
    light: { sky: "#1d6f8a", amber: "gold", coral: "#abc", text: "  #1c2416  " },
    dark: { "swipe-like": "#3ec27a", bg: "#11223" },
  });
  assert.equal(merged.light.sky, "#1d6f8a");
  assert.equal(merged.light.amber, LOGO_PALETTE.light.amber);
  assert.equal(merged.light.coral, LOGO_PALETTE.light.coral);
  assert.equal(merged.light.text, "#1c2416");
  assert.equal(merged.dark["swipe-like"], "#3ec27a");
  assert.equal(merged.dark.bg, LOGO_PALETTE.dark.bg);
});

test("paletteStyleMap is the CSS variable map applyPalette would write", () => {
  const map = paletteStyleMap({ dark: { amber: "#ABCDEF" } });
  assert.equal(map.dark["--amber"], "#abcdef");
  assert.equal(map.dark["--bg"], LOGO_PALETTE.dark.bg);
  assert.equal(map.dark["--sky"], "#7ec8e3");
  assert.equal(map.light["--bg"], "#f7f1e1");
  assert.equal(map.light["--amber"], "#8a6a12");
  assert.match(map.cssText, /:root\{[^}]*--amber:#abcdef !important/);
  assert.match(map.cssText, /:root\[data-theme="light"\]\{[^}]*--bg:#f7f1e1 !important/);
  assert.equal(Object.keys(map.dark).length, PALETTE_TOKENS.length);
  assert.deepEqual(PALETTE_THEMES.map((theme) => theme.id), ["dark", "light"]);
});

test("applyPalette returns the map when document is absent", () => {
  const previous = globalThis.document;
  // eslint-disable-next-line no-global-assign
  delete globalThis.document;
  try {
    const map = applyPalette({ dark: { bg: "#010203" } });
    assert.equal(map.dark["--bg"], "#010203");
    assert.equal(map.light["--text"], LOGO_PALETTE.light.text);
    assert.match(map.cssText, /--bg:#010203 !important/);
  } finally {
    if (previous) globalThis.document = previous;
  }
});

test("each public page applies the palette cache before first paint", () => {
  for (const page of PAGES) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(html, /bdc-palette-v1/, `${page} must read the palette cache`);
    assert.match(html, /bdc-palette/, `${page} must inject the palette style`);
    for (const token of PALETTE_TOKENS) {
      assert.match(html, new RegExp(token.id.replace("-", "\\-")), `${page} missing ${token.id}`);
    }
  }
});

test("migration 011 stores palette and only an admin can write it", () => {
  const sql = readFileSync(new URL("../supabase/migrations/011_site_palette.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists palette jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /'palette', coalesce\(palette, '\{\}'::jsonb\)/);
  assert.match(sql, /function public\.set_site_palette\(p_palette jsonb\)/);
  assert.match(sql, /private\.require_admin\(\)/);
  assert.match(sql, /#\[0-9a-fA-F\]\{6\}/);
  assert.match(sql, /grant execute on function public\.set_site_palette\(jsonb\) to authenticated/);
  assert.match(sql, /grant execute on function public\.get_site_features\(\) to anon, authenticated/);
});
