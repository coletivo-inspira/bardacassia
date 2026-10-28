import "./cartaz.css";
import QRCode from "qrcode";
import { posterUrl } from "./lib/origin.js";

const SITE_URL = String(import.meta.env.VITE_SITE_URL || "").trim();

const els = {
  poster: document.querySelector("#poster"),
  qr: document.querySelector("#poster-qr"),
  url: document.querySelector("#poster-url"),
  size: document.querySelector("#poster-size"),
  origin: document.querySelector("#poster-origin"),
  print: document.querySelector("#poster-print"),
  pageStyle: document.createElement("style"),
};

async function render() {
  const url = posterUrl(SITE_URL || new URL("./", window.location.href).href, els.origin.value);
  els.poster.dataset.size = els.size.value;
  els.pageStyle.textContent = `@page { size: ${els.size.value.toUpperCase()} portrait; margin: 0; }`;
  // SVG gerado localmente pela biblioteca: nítido em qualquer tamanho de impressão.
  els.qr.innerHTML = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 1, color: { dark: "#141414", light: "#ffffff" } });
  els.url.textContent = url.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
}

document.head.append(els.pageStyle);
els.size.addEventListener("change", render);
els.origin.addEventListener("change", render);
els.print.addEventListener("click", () => window.print());
void render();
