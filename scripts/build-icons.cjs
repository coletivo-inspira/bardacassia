// Regenera os ícones de tela de início a partir de public/logo_bar_da_cacia.svg.
// Uso: PLAYWRIGHT_MODULE=/caminho/para/playwright node scripts/build-icons.cjs
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "public/icons");
const BG = "#1a2218";

// `fill` is the share of the icon width the logo may take; maskable keeps it inside Android's 80% safe circle.
const ICONS = [
  { file: "apple-touch-icon.png", size: 180, fill: 0.8 },
  { file: "icon-192.png", size: 192, fill: 0.8 },
  { file: "icon-512.png", size: 512, fill: 0.8 },
  { file: "icon-maskable-512.png", size: 512, fill: 0.62 },
  { file: "favicon-32.png", size: 32, fill: 0.94 },
];

(async () => {
  const svg = readFileSync(resolve(ROOT, "public/logo_bar_da_cacia.svg"), "utf8")
    .replace(/width="100%"\s+height="100%"/, 'width="2000" height="1500"');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = await page.evaluate(async ({ svg, icons, bg }) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const src = document.createElement("canvas");
    src.width = img.naturalWidth;
    src.height = img.naturalHeight;
    const sctx = src.getContext("2d");
    sctx.drawImage(img, 0, 0);
    const { data, width, height } = sctx.getImageData(0, 0, src.width, src.height);
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    return icons.map(({ file, size, fill }) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      const scale = Math.min((size * fill) / bw, (size * fill) / bh);
      const w = bw * scale;
      const h = bh * scale;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, x0, y0, bw, bh, (size - w) / 2, (size - h) / 2, w, h);
      return { file, png: canvas.toDataURL("image/png").split(",")[1] };
    });
  }, { svg, icons: ICONS, bg: BG });
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  for (const { file, png } of results) {
    writeFileSync(resolve(OUT, file), Buffer.from(png, "base64"));
    console.log(`public/icons/${file}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
