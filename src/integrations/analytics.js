import { readOrigin } from "../lib/origin.js";

// "G-XXXX" usa o Google Analytics 4 (com eventos); outro valor é tratado como token do
// Cloudflare Web Analytics, que conta acessos sem cookies mas não recebe eventos.
const ANALYTICS_ID = String(import.meta.env.VITE_ANALYTICS_ID || "").trim();
const ORIGIN_KEY = "bdc-origem-v1";

let started = false;
let origin = "";

function loadScript(src, attributes = {}) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  for (const [key, value] of Object.entries(attributes)) script.setAttribute(key, value);
  document.head.append(script);
}

function sessionOrigin() {
  const fromUrl = readOrigin(window.location.search);
  try {
    if (fromUrl) sessionStorage.setItem(ORIGIN_KEY, fromUrl);
    return fromUrl || sessionStorage.getItem(ORIGIN_KEY) || "";
  } catch {
    return fromUrl;
  }
}

export function initAnalytics() {
  if (started || !ANALYTICS_ID) return;
  started = true;
  origin = sessionOrigin();
  if (ANALYTICS_ID.startsWith("G-")) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ANALYTICS_ID, origin ? { campaign_source: origin, campaign_medium: "qr" } : {});
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`);
  } else {
    loadScript("https://static.cloudflareinsights.com/beacon.min.js", {
      defer: "",
      "data-cf-beacon": JSON.stringify({ token: ANALYTICS_ID }),
    });
  }
}

/** Eventos sem dados pessoais: só o nome da ação, o código da música e a origem (mesa, instagram…). */
export function trackEvent(name, params = {}) {
  if (!started || typeof window.gtag !== "function") return;
  window.gtag("event", name, origin ? { ...params, origem: origin } : params);
}
