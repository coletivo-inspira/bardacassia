/** Cores editáveis do site. Importável no Node: não lê import.meta.env. */

export const PALETTE_KEY = "bdc-palette-v1";
export const PALETTE_STYLE_ID = "bdc-palette";

export const PALETTE_THEMES = [
  { id: "dark", label: "Modo noturno" },
  { id: "light", label: "Modo claro" },
];

/** Um token por cor, nos dois temas. `css` é a variável em styles.css. */
export const PALETTE_TOKENS = [
  { id: "bg", label: "Fundo", css: "--bg", themes: ["dark", "light"] },
  { id: "bg-elev", label: "Fundo elevado", css: "--bg-elev", themes: ["dark", "light"] },
  { id: "bg-soft", label: "Fundo suave", css: "--bg-soft", themes: ["dark", "light"] },
  { id: "text", label: "Texto", css: "--text", themes: ["dark", "light"] },
  { id: "muted", label: "Texto discreto", css: "--muted", themes: ["dark", "light"] },
  { id: "amber", label: "Dourado", css: "--amber", themes: ["dark", "light"] },
  { id: "sky", label: "Azul do microfone", css: "--sky", themes: ["dark", "light"] },
  { id: "coral", label: "Coral", css: "--coral", themes: ["dark", "light"] },
  { id: "swipe-like", label: "Sucesso", css: "--swipe-like", themes: ["dark", "light"] },
];

/** Cores da logo. O claro escurece dourado, céu e coral para o creme continuar legível. */
export const LOGO_PALETTE = {
  dark: {
    bg: "#1a2218",
    "bg-elev": "#121810",
    "bg-soft": "#263026",
    text: "#f6f3ea",
    muted: "#c4c0b0",
    amber: "#e6c34a",
    sky: "#7ec8e3",
    coral: "#e85d4c",
    "swipe-like": "#3ec27a",
  },
  light: {
    bg: "#f7f1e1",
    "bg-elev": "#efe6d0",
    "bg-soft": "#e6dcc4",
    text: "#1c2416",
    muted: "#5c6454",
    amber: "#8a6a12",
    sky: "#1d6f8a",
    coral: "#a33b2e",
    "swipe-like": "#0f8a4c",
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value) {
  return typeof value === "string" && HEX.test(value.trim());
}

function blankPalette() {
  return {
    dark: { ...LOGO_PALETTE.dark },
    light: { ...LOGO_PALETTE.light },
  };
}

/** Mantém a logo quando o remoto vem vazio ou inválido. Hex válido substitui só aquele token. */
export function mergePalette(remote) {
  const next = blankPalette();
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) return next;
  for (const theme of PALETTE_THEMES) {
    const source = remote[theme.id];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const token of PALETTE_TOKENS) {
      const value = source[token.id];
      if (!isHexColor(value)) continue;
      next[theme.id][token.id] = value.trim().toLowerCase();
    }
  }
  return next;
}

/** Mapa puro do que applyPalette escreveria. Sem document, é só isto. */
export function paletteStyleMap(palette) {
  const merged = mergePalette(palette);
  const dark = {};
  const light = {};
  for (const token of PALETTE_TOKENS) {
    dark[token.css] = merged.dark[token.id];
    light[token.css] = merged.light[token.id];
  }
  const block = (vars) => Object.entries(vars).map(([name, value]) => `${name}:${value} !important`).join(";");
  return {
    dark,
    light,
    cssText: `:root{${block(dark)}}:root[data-theme="light"]{${block(light)}}`,
  };
}

function writeCache(merged) {
  try {
    localStorage.setItem(PALETTE_KEY, JSON.stringify(merged));
  } catch {
    /* a página segue com as variáveis já aplicadas */
  }
}

export function clearPalette() {
  if (typeof document !== "undefined" && document.getElementById) {
    document.getElementById(PALETTE_STYLE_ID)?.remove();
    const root = document.documentElement;
    if (root?.style?.removeProperty) {
      for (const token of PALETTE_TOKENS) root.style.removeProperty(token.css);
    }
  }
  try {
    localStorage.removeItem(PALETTE_KEY);
  } catch {
    /* sem armazenamento, o CSS da logo continua valendo */
  }
}

/**
 * Escuro em :root e claro em :root[data-theme="light"], os dois com !important
 * para ganharem da folha carregada depois e o toggle de tema continuar valendo.
 */
export function applyPalette(palette, { persist = true } = {}) {
  const map = paletteStyleMap(palette);
  if (typeof document === "undefined" || !document?.documentElement || !document.head) return map;
  let style = document.getElementById?.(PALETTE_STYLE_ID);
  if (!style && document.createElement) {
    style = document.createElement("style");
    style.id = PALETTE_STYLE_ID;
    document.head.appendChild(style);
  }
  if (style) style.textContent = map.cssText;
  for (const [name, value] of Object.entries(map.dark)) {
    document.documentElement.style?.setProperty?.(name, value);
  }
  if (persist) writeCache(mergePalette(palette));
  return map;
}
