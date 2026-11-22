export const INSTALL_DISMISS_KEY = "bdc-install-dismissed-v1";
export const INSTALL_REMIND_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const NOTICE_DELAY_MS = 3500;
const NOTICE_SCROLL_PX = 160;
const NOTICE_RETRY_MS = 1500;

/**
 * iPadOS reports itself as a Mac, so touch points tell the two apart. In-app browsers (Instagram, Facebook) cannot add
 * to the home screen and need "Abrir no navegador" first.
 */
export function detectInstallPlatform({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent);
  const iPad = /iPad/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const ios = iPad || /iPhone|iPod/.test(ua);
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly/i.test(ua);
  if (ios) {
    const browser = inApp ? "in-app" : /CriOS/.test(ua) ? "chrome" : /FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? "other" : "safari";
    return { os: "ios", device: iPad ? "iPad" : "iPhone", browser };
  }
  if (/Android/i.test(ua)) return { os: "android", device: "Android", browser: inApp ? "in-app" : "other" };
  return { os: "desktop", device: "computador", browser: "other" };
}

export function isStandaloneDisplay(win = globalThis) {
  if (win?.navigator?.standalone === true) return true;
  return ["standalone", "fullscreen", "minimal-ui"].some((mode) => win?.matchMedia?.(`(display-mode: ${mode})`).matches);
}

function readNoticeRecord(raw) {
  try {
    const record = JSON.parse(raw || "null");
    if (!record || typeof record !== "object") return null;
    return { at: Number(record.at) || 0, count: Number(record.count) || 0 };
  } catch {
    return null;
  }
}

/** First visit shows it; after it was seen or closed it may come back once, 30 days later, and then never again. */
export function shouldShowInstallNotice(raw, now = Date.now()) {
  const record = readNoticeRecord(raw);
  if (!record || record.count < 1) return true;
  return record.count === 1 && now - record.at >= INSTALL_REMIND_AFTER_MS;
}

export function nextInstallNoticeRecord(raw, now = Date.now(), { bump = true } = {}) {
  const count = readNoticeRecord(raw)?.count || 0;
  return JSON.stringify({ at: now, count: bump ? count + 1 : Math.max(1, count) });
}

const CLOSE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const SHARE_ICON = `<svg class="install-inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8.2 7.3 12 3.5l3.8 3.8"/><path d="M8.5 10.5H6.8a1.3 1.3 0 0 0-1.3 1.3v7.4a1.3 1.3 0 0 0 1.3 1.3h10.4a1.3 1.3 0 0 0 1.3-1.3v-7.4a1.3 1.3 0 0 0-1.3-1.3h-1.7"/></svg>`;
const ADD_ICON = `<svg class="install-inline-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>`;
const MORE_ICON = `<span class="install-inline-glyph" aria-hidden="true">•••</span>`;
const KEBAB_ICON = `<span class="install-inline-glyph" aria-hidden="true">⋮</span>`;
const ICON_SRC = "icons/apple-touch-icon.png";

let deferredPrompt = null;
let installed = false;
let sheet = null;
let notice = null;
const installedListeners = new Set();

function platform() {
  return detectInstallPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

/** False once the site runs as the home-screen app (or was just installed), so nothing offers to install it again. */
export function installAvailable() {
  return !installed && !isStandaloneDisplay(window);
}

export function onAppInstalled(callback) {
  installedListeners.add(callback);
  return () => installedListeners.delete(callback);
}

function markInstalled() {
  installed = true;
  deferredPrompt = null;
  hideNotice();
  if (sheet?.open) sheet.close();
  installedListeners.forEach((callback) => callback());
}

/** Chrome/Edge only fire beforeinstallprompt early, so every public page listens from the start. */
export function captureInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    queueNotice(0);
  });
  window.addEventListener("appinstalled", markInstalled);
}

/** Network-first worker; it only exists so Android Chrome offers installation. */
export function registerServiceWorker() {
  if (!import.meta.env?.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register(new URL("sw.js", document.baseURI)).catch(() => {
      /* the site works the same without it */
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

function steps(items) {
  return `<ol class="install-sheet-steps">${items.map((item) => `<li>${item}</li>`).join("")}</ol>`;
}

function sheetContent() {
  const info = platform();
  if (deferredPrompt) {
    return {
      title: "Instalar o app",
      body: `<p class="install-sheet-lead">Coloque o Bar da Cácia na sua tela de início e abra o catálogo com um toque, sem a barra do navegador.</p>`,
      actions: `<button type="button" class="install-sheet-secondary" data-install-close>Agora não</button>
        <button type="button" class="install-sheet-primary" data-install-prompt>Instalar</button>`,
    };
  }
  const done = `<button type="button" class="install-sheet-primary" data-install-close>Entendi</button>`;
  if (info.os === "ios") {
    const add = [
      `Role as opções e escolha <strong>Adicionar à Tela de Início</strong> ${ADD_ICON}.`,
      `Toque em <strong>Adicionar</strong>. O app aparece junto dos outros.`,
    ];
    const share = info.browser === "in-app"
      ? [`Toque em ${MORE_ICON} no canto da tela e escolha <strong>Abrir no navegador</strong>.`, `No Safari, toque em compartilhar ${SHARE_ICON} (o quadrado com a seta para cima).`]
      : info.browser === "chrome"
        ? [`Toque em compartilhar ${SHARE_ICON} na barra de endereço do Chrome.`]
        : info.browser === "safari"
          ? [`Toque em compartilhar ${SHARE_ICON} na barra do Safari (o quadrado com a seta para cima). Se não aparecer, toque antes em ${MORE_ICON}.`]
          : [`Abra o menu do navegador e toque em compartilhar ${SHARE_ICON}.`];
    return { title: `Instalar no ${info.device}`, body: steps([...share, ...add]), actions: done };
  }
  if (info.os === "android") {
    return {
      title: "Instalar no Android",
      body: steps([
        `Toque no menu ${KEBAB_ICON} do navegador.`,
        `Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.`,
        `Confirme em <strong>Instalar</strong>. O app aparece junto dos outros.`,
      ]),
      actions: done,
    };
  }
  return {
    title: "Instalar no computador",
    body: `${steps([
      `No Chrome ou no Edge, clique no ícone de instalar na barra de endereço, ou abra o menu ${KEBAB_ICON} e escolha <strong>Instalar Bar da Cácia</strong>.`,
      `No Safari do Mac, use <strong>Arquivo › Adicionar ao Dock</strong>.`,
    ])}<p class="install-sheet-note">O Firefox no computador não instala sites.</p>`,
    actions: done,
  };
}

function ensureSheet() {
  if (sheet) return sheet;
  sheet = document.createElement("dialog");
  sheet.className = "install-sheet";
  sheet.setAttribute("aria-labelledby", "install-sheet-title");
  sheet.addEventListener("click", async (event) => {
    if (event.target === sheet) {
      sheet.close();
      return;
    }
    if (event.target.closest("[data-install-close]")) {
      sheet.close();
      return;
    }
    if (event.target.closest("[data-install-prompt]") && deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      sheet.close();
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === "accepted") markInstalled();
      } catch {
        /* the browser refused; the sheet can be opened again for the manual steps */
      }
    }
  });
  sheet.addEventListener("close", () => {
    const back = sheet.returnFocusTo;
    sheet.returnFocusTo = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  });
  document.body.append(sheet);
  return sheet;
}

export function openInstallSheet({ returnFocusTo = document.activeElement } = {}) {
  if (!installAvailable()) return;
  const dialog = ensureSheet();
  const { title, body, actions } = sheetContent();
  dialog.innerHTML = `
    <div class="install-sheet-panel">
      <span class="install-sheet-grabber" aria-hidden="true"></span>
      <header class="install-sheet-head">
        <img class="install-sheet-icon" src="${ICON_SRC}" alt="" width="44" height="44" />
        <h2 id="install-sheet-title" class="install-sheet-title"></h2>
        <button type="button" class="install-sheet-close" data-install-close aria-label="Fechar">${CLOSE_ICON}</button>
      </header>
      <div class="install-sheet-body">${body}</div>
      <div class="install-sheet-actions">${actions}</div>
    </div>`;
  dialog.querySelector(".install-sheet-title").textContent = title;
  dialog.returnFocusTo = returnFocusTo;
  hideNotice();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  dialog.querySelector(".install-sheet-primary")?.focus({ preventScroll: true });
}

/* First-visit notice */

let noticeTimer = 0;
let noticeArmed = false;

function noticeStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function phoneLayout() {
  if (!window.matchMedia("(max-width: 1023px)").matches) return false;
  return platform().os !== "desktop" || window.matchMedia("(pointer: coarse)").matches;
}

/** Searching, the keyboard, filters and any open dialog all keep the notice away. */
function noticeBlocked() {
  const root = document.documentElement;
  if (root.classList.contains("is-keyboard-open") || root.classList.contains("discover-open")) return true;
  if (document.querySelector("dialog[open]")) return true;
  if (document.querySelector("[data-hero-collapse].is-collapsed, .header-search.is-suggesting, .header-search.is-filters-open")) return true;
  return false;
}

function hideNotice() {
  if (!notice) return;
  notice.remove();
  notice = null;
}

function dismissNotice() {
  noticeStore()?.setItem(INSTALL_DISMISS_KEY, nextInstallNoticeRecord(noticeStore()?.getItem(INSTALL_DISMISS_KEY), Date.now(), { bump: false }));
  hideNotice();
}

function showNotice() {
  const store = noticeStore();
  if (notice || !store || !installAvailable() || !shouldShowInstallNotice(store.getItem(INSTALL_DISMISS_KEY))) return;
  store.setItem(INSTALL_DISMISS_KEY, nextInstallNoticeRecord(store.getItem(INSTALL_DISMISS_KEY)));
  notice = document.createElement("aside");
  notice.className = "install-notice";
  notice.setAttribute("aria-label", "Instalar o app");
  notice.innerHTML = `
    <img class="install-notice-icon" src="${ICON_SRC}" alt="" width="40" height="40" />
    <p class="install-notice-text">Instale o Bar da Cácia na sua tela de início</p>
    <button type="button" class="install-notice-cta">Instalar</button>
    <button type="button" class="install-notice-close" aria-label="Fechar aviso">${CLOSE_ICON}</button>`;
  notice.querySelector(".install-notice-cta").addEventListener("click", () => {
    dismissNotice();
    openInstallSheet({ returnFocusTo: null });
  });
  notice.querySelector(".install-notice-close").addEventListener("click", dismissNotice);
  document.body.append(notice);
}

function queueNotice(delay) {
  if (!noticeArmed || notice) return;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(tryNotice, delay);
}

function tryNotice() {
  if (!noticeArmed || notice || !installAvailable() || !phoneLayout()) return;
  if (platform().os !== "ios" && !deferredPrompt) return;
  if (noticeBlocked()) {
    queueNotice(NOTICE_RETRY_MS);
    return;
  }
  showNotice();
}

/** Phones only: a few seconds in or after a short scroll, whichever comes first. */
export function scheduleInstallNotice() {
  if (noticeArmed || !installAvailable()) return;
  if (!shouldShowInstallNotice(noticeStore()?.getItem(INSTALL_DISMISS_KEY))) return;
  noticeArmed = true;
  queueNotice(NOTICE_DELAY_MS);
  const onScroll = () => {
    if (window.scrollY < NOTICE_SCROLL_PX) return;
    window.removeEventListener("scroll", onScroll);
    queueNotice(0);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
}
