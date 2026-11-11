import { applyFeatureChrome, hideExpiredEventNav, initializeTheme } from "./site.js";
import { loadSiteFeatures } from "./integrations/features.js";
import {
  authBackendReady,
  captchaSiteKey,
  currentAuthProviders,
  getCurrentUser,
  onAuthChange,
  publicAuthEnabled,
  requestPasswordReset,
  signIn,
  signInWithEmailLink,
  signInWithProvider,
  signUp,
  updatePassword,
} from "./integrations/auth.js";
import { updateMyProfile } from "./integrations/profile.js";
import { getPersistSession } from "./integrations/supabase.js";
import {
  authErrorMessage,
  passwordStrength,
  safeNextPath,
  validateDisplayName,
  validateEmail,
  validateLoginPassword,
  validateNewPassword,
} from "./lib/auth-validation.js";
initializeTheme();
hideExpiredEventNav();

const MODES = {
  entrar: { title: "Entrar", submit: "Entrar", passwordAutocomplete: "current-password" },
  cadastrar: { title: "Cadastrar", submit: "Criar conta", passwordAutocomplete: "new-password" },
  link: { title: "Entrar com link", submit: "Enviar link", subtitle: "Enviaremos um link de acesso para o seu e-mail." },
  redefinir: { title: "Redefinir senha", submit: "Enviar link", subtitle: "Informe seu e-mail e enviaremos um link para criar uma nova senha." },
  "nova-senha": { title: "Nova senha", submit: "Salvar senha", passwordAutocomplete: "new-password", subtitle: "Crie a senha que você vai usar para entrar." },
};
const SIGNED_OUT_MODES = new Set(["entrar", "cadastrar", "link", "redefinir"]);
/** Perfil, dados e privacidade live in the Conta hero; `#conta` and signed-in visits go there. */
const ACCOUNT_PAGE = "conta.html";
const ACCOUNT_EDITOR_PAGE = "conta.html#perfil";
const PASSWORD_SAVED_PAGE = "conta.html?senha=salva#perfil";
const CAPTCHA_MODES = new Set(["entrar", "cadastrar", "link", "redefinir"]);
const STRENGTH_LABELS = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];

const $ = (selector) => document.querySelector(selector);
const card = $("#auth-card");
const form = $("#auth-form");
const submit = $("#auth-submit");
const status = $("#auth-status");
const fields = {
  displayName: { input: $("#auth-name"), error: $("#auth-name-error") },
  email: { input: $("#auth-email"), error: $("#auth-email-error") },
  password: { input: $("#auth-password"), error: $("#auth-password-error") },
  passwordConfirm: { input: $("#auth-password-confirm"), error: $("#auth-password-confirm-error") },
};
const persistInput = $("#auth-persist");
const consentInput = $("#auth-consent");
const consentError = $("#auth-consent-error");
const params = new URLSearchParams(location.search);
const nextPath = safeNextPath(params.get("next"));
const returnedFromProvider = params.has("code");
const urlError = params.get("error_description") || new URLSearchParams(location.hash.slice(1)).get("error_description");

let mode = "entrar";
let currentUser = null;
let busy = false;
let captchaToken = "";
let captchaWidget = null;
const touched = new Set();

function setStatus(message, tone = "info") {
  status.hidden = !message;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

function activeFieldNames() {
  return Object.keys(fields).filter((name) => {
    const wrapper = fields[name].input.closest("[data-modes]");
    return wrapper.dataset.modes.split(" ").includes(mode);
  });
}

function fieldError(name) {
  const value = fields[name].input.value;
  switch (name) {
    case "displayName": return validateDisplayName(value);
    case "email": return validateEmail(value);
    case "password": return mode === "entrar" ? validateLoginPassword(value) : validateNewPassword(value, { email: fields.email.input.value || currentUser?.email });
    case "passwordConfirm": return value === fields.password.input.value ? "" : "As senhas não coincidem.";
    default: return "";
  }
}

function renderValidation({ showAll = false } = {}) {
  let valid = true;
  for (const name of activeFieldNames()) {
    const message = fieldError(name);
    if (message) valid = false;
    const visible = showAll || touched.has(name) ? message : "";
    fields[name].error.textContent = visible;
    fields[name].input.setAttribute("aria-invalid", String(Boolean(visible)));
  }
  if (mode === "cadastrar") {
    const consentOk = Boolean(consentInput?.checked);
    if (!consentOk) valid = false;
    if (consentError) {
      consentError.textContent = (showAll || touched.has("consent")) && !consentOk
        ? "Marque a autorização de uso dos dados para criar a conta."
        : "";
    }
  } else if (consentError) {
    consentError.textContent = "";
  }
  const needsCaptcha = captchaSiteKey && CAPTCHA_MODES.has(mode);
  submit.disabled = busy || !loginUiEnabled() || !valid || Boolean(needsCaptcha && !captchaToken);
  return valid;
}

function renderStrength() {
  const value = fields.password.input.value;
  const score = passwordStrength(value);
  const bar = $("#auth-strength-bar");
  bar.style.setProperty("--strength", value ? (score + 1) / 5 : 0);
  bar.dataset.score = String(score);
  $("#auth-strength-label").textContent = value
    ? `Força da senha: ${STRENGTH_LABELS[score]}`
    : "Mínimo de 8 caracteres, com letras e números.";
}

function leaveForAccount(page) {
  location.replace(new URL(page, location.href).href);
}

function setMode(next, { keepStatus = false } = {}) {
  if (next === "conta") {
    leaveForAccount(ACCOUNT_EDITOR_PAGE);
    return;
  }
  if (currentUser && SIGNED_OUT_MODES.has(next)) {
    if (params.has("next")) goNext();
    else leaveForAccount(ACCOUNT_PAGE);
    return;
  }
  if (!MODES[next]) next = "entrar";
  mode = next;
  const config = MODES[mode];
  card.dataset.mode = mode;
  $("#auth-title").textContent = config.title;
  card.setAttribute("aria-label", config.title);
  document.title = `${config.title} — Bar da Cácia`;
  const subtitle = $("#auth-subtitle");
  subtitle.hidden = !config.subtitle;
  subtitle.textContent = config.subtitle || "";
  submit.textContent = config.submit || "";
  if (config.passwordAutocomplete) fields.password.input.autocomplete = config.passwordAutocomplete;
  fields.password.input.placeholder = mode === "entrar" ? "Senha" : "Nova senha";

  document.querySelectorAll("#auth-card [data-modes]").forEach((element) => {
    element.hidden = !element.dataset.modes.split(" ").includes(mode);
  });
  $("#auth-social").hidden = !currentAuthProviders().length || !["entrar", "cadastrar"].includes(mode);
  $("#auth-captcha").hidden = !(captchaSiteKey && CAPTCHA_MODES.has(mode));
  initializeTheme();

  touched.clear();
  if (!keepStatus) setStatus("");
  renderStrength();
  renderValidation();
  if (`#${mode}` !== location.hash && !(mode === "entrar" && !location.hash)) {
    history.replaceState(null, "", `${location.pathname}${location.search}#${mode}`);
  }
}

async function setupCaptcha() {
  if (!captchaSiteKey || captchaWidget !== null) return;
  captchaWidget = "loading";
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  }).catch(() => setStatus("Não foi possível carregar a verificação de segurança. Recarregue a página.", "error"));
  if (!window.turnstile) return;
  captchaWidget = window.turnstile.render("#auth-captcha", {
    sitekey: captchaSiteKey,
    language: "pt-br",
    theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
    callback: (token) => { captchaToken = token; renderValidation(); },
    "expired-callback": () => { captchaToken = ""; renderValidation(); },
    "error-callback": () => { captchaToken = ""; renderValidation(); },
  });
}

function resetCaptcha() {
  if (!captchaSiteKey || !window.turnstile || typeof captchaWidget !== "string" || captchaWidget === "loading") return;
  captchaToken = "";
  window.turnstile.reset(captchaWidget);
}

function goNext() {
  location.assign(new URL(nextPath, location.href).href);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (busy) return;
  activeFieldNames().forEach((name) => touched.add(name));
  if (!renderValidation({ showAll: true })) {
    const firstInvalid = activeFieldNames().find((name) => fieldError(name));
    fields[firstInvalid]?.input.focus();
    return;
  }
  busy = true;
  submit.setAttribute("aria-busy", "true");
  renderValidation();
  setStatus("");
  const email = fields.email.input.value;
  const password = fields.password.input.value;
  const persist = persistInput.checked;
  try {
    if (mode === "entrar") {
      await signIn({ email, password, persist, captchaToken });
      goNext();
      return;
    }
    if (mode === "cadastrar") {
      const result = await signUp({ email, password, persist, captchaToken, displayName: fields.displayName.input.value, next: nextPath });
      if (!result.needsConfirmation) {
        try { await updateMyProfile({ grantConsent: true }); } catch { /* o perfil pode ser preenchido depois na Conta */ }
        goNext();
        return;
      }
      form.reset();
      persistInput.checked = persist;
      if (consentInput) consentInput.checked = false;
      setMode("entrar", { keepStatus: true });
      setStatus(result.needsPassword
        ? "Enviamos um link de confirmação para o seu e-mail. Ao abrir, você vai criar a senha da conta."
        : "Enviamos um link de confirmação para o seu e-mail. Confirme para entrar.", "success");
      return;
    }
    if (mode === "link") {
      await signInWithEmailLink({ email, persist, captchaToken, next: nextPath });
      setStatus("Se houver uma conta com esse e-mail, você vai receber um link de acesso em instantes.", "success");
      return;
    }
    if (mode === "redefinir") {
      await requestPasswordReset({ email, captchaToken });
      setStatus("Se houver uma conta com esse e-mail, você vai receber o link para criar uma nova senha.", "success");
      return;
    }
    if (mode === "nova-senha") {
      await updatePassword(password);
      fields.password.input.value = "";
      fields.passwordConfirm.input.value = "";
      leaveForAccount(PASSWORD_SAVED_PAGE);
    }
  } catch (error) {
    setStatus(authErrorMessage(error), "error");
  } finally {
    busy = false;
    submit.removeAttribute("aria-busy");
    resetCaptcha();
    renderValidation();
  }
}

function bindEvents() {
  form.addEventListener("submit", handleSubmit);
  Object.entries(fields).forEach(([name, { input }]) => {
    input.addEventListener("input", () => {
      if (name === "password") renderStrength();
      renderValidation();
    });
    input.addEventListener("blur", () => {
      if (input.value) touched.add(name);
      renderValidation();
    });
  });
  consentInput?.addEventListener("change", () => {
    touched.add("consent");
    renderValidation();
  });
  const toggle = $("#auth-toggle-password");
  toggle.addEventListener("click", () => {
    const show = fields.password.input.type === "password";
    for (const input of [fields.password.input, fields.passwordConfirm.input]) input.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? "Ocultar senha inserida" : "Mostrar senha inserida");
  });

  const helpButton = $("#auth-persist-help");
  const tooltip = $("#auth-persist-tooltip");
  const setTooltip = (open) => {
    tooltip.hidden = !open;
    helpButton.setAttribute("aria-expanded", String(open));
  };
  helpButton.addEventListener("click", () => setTooltip(tooltip.hidden));
  helpButton.addEventListener("blur", () => setTooltip(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setTooltip(false); });

  document.querySelectorAll("[data-provider]").forEach((button) => {
    button.hidden = !currentAuthProviders().includes(button.dataset.provider);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await signInWithProvider(button.dataset.provider, { persist: persistInput.checked, next: nextPath });
      } catch (error) {
        setStatus(authErrorMessage(error), "error");
        button.disabled = false;
      }
    });
  });

  window.addEventListener("hashchange", () => setMode(location.hash.slice(1)));
}

function loginUiEnabled() {
  if (!authBackendReady) return false;
  if (publicAuthEnabled()) return true;
  const next = safeNextPath(new URLSearchParams(location.search).get("next") || "", "");
  return next.startsWith("admin.html");
}

async function start() {
  await loadSiteFeatures();
  applyFeatureChrome();
  persistInput.checked = getPersistSession();
  bindEvents();
  setMode(location.hash.slice(1) || "entrar");

  if (!loginUiEnabled()) {
    $("#auth-unavailable").hidden = false;
    form.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
    return;
  }
  if (urlError) setStatus(authErrorMessage(urlError), "error");
  void setupCaptcha();

  try {
    currentUser = await getCurrentUser();
  } catch {
    currentUser = null;
  }
  if (returnedFromProvider) {
    params.delete("code");
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
  }
  const requested = location.hash.slice(1);
  if (requested === "nova-senha" && !currentUser) {
    setMode("redefinir", { keepStatus: true });
    if (!urlError) setStatus("O link de redefinição expirou ou já foi usado. Peça um novo.", "error");
  } else if (returnedFromProvider && currentUser && requested !== "nova-senha") {
    goNext();
    return;
  } else {
    setMode(requested || "entrar", { keepStatus: true });
  }

  await onAuthChange(async (event) => {
    if (event === "PASSWORD_RECOVERY") {
      currentUser = await getCurrentUser();
      setMode("nova-senha");
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      if (mode === "nova-senha") setMode("entrar", { keepStatus: true });
    } else if (event === "USER_UPDATED" || event === "SIGNED_IN") {
      currentUser = await getCurrentUser();
    }
  });
}

void start();
