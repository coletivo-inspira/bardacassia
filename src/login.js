import { hideExpiredEventNav, initializeTheme } from "./site.js";
import {
  authConfigured,
  authProviders,
  captchaSiteKey,
  deleteAccount,
  displayName,
  getCurrentUser,
  onAuthChange,
  requestPasswordReset,
  signIn,
  signInWithEmailLink,
  signInWithProvider,
  signOut,
  signUp,
  updatePassword,
} from "./integrations/auth.js";
import { getMyPhone, getMyProfile, hasCurrentConsent, setMyPhone, updateMyProfile, uploadMyAvatar } from "./integrations/profile.js";
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
import {
  AVATAR_MAX_INPUT_BYTES,
  clampAvatarViewport,
  compressAvatarFile,
  cropRectFromViewport,
  formatPhoneMask,
  minCoverScale,
  phoneDigits,
  profileInitials,
  toE164Phone,
  validateBirthDate,
  validatePhone,
} from "./lib/profile.js";

initializeTheme();
hideExpiredEventNav();

const MODES = {
  entrar: { title: "Entrar", submit: "Entrar", passwordAutocomplete: "current-password" },
  cadastrar: { title: "Cadastrar", submit: "Criar conta", passwordAutocomplete: "new-password" },
  link: { title: "Entrar com link", submit: "Enviar link", subtitle: "Enviaremos um link de acesso para o seu e-mail." },
  redefinir: { title: "Redefinir senha", submit: "Enviar link", subtitle: "Informe seu e-mail e enviaremos um link para criar uma nova senha." },
  "nova-senha": { title: "Nova senha", submit: "Salvar senha", passwordAutocomplete: "new-password", subtitle: "Crie a senha que você vai usar para entrar." },
  conta: { title: "Minha conta" },
};
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
const accountConsentInput = $("#auth-account-consent");
const birthDateInput = $("#auth-birth-date");
const birthDateError = $("#auth-birth-date-error");
const phoneInput = $("#auth-phone");
const phoneError = $("#auth-phone-error");
const profileForm = $("#auth-profile-form");
const avatarImage = $("#auth-account-avatar");
const avatarInitials = $("#auth-account-initials");
const avatarInput = $("#auth-avatar-input");
const avatarStatus = $("#auth-avatar-status");
const avatarCropDialog = $("#auth-avatar-crop");
const avatarCropFrame = $("#auth-avatar-crop-frame");
const avatarCropImage = $("#auth-avatar-crop-image");
const avatarCropZoom = $("#auth-avatar-crop-zoom");
const avatarCropCancel = $("#auth-avatar-crop-cancel");
const avatarCropConfirm = $("#auth-avatar-crop-confirm");
const lgpdStatus = $("#auth-lgpd-status");

const avatarCropState = {
  file: null,
  objectUrl: "",
  imageWidth: 0,
  imageHeight: 0,
  viewportSize: 280,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  returnFocus: null,
};

const params = new URLSearchParams(location.search);
const nextPath = safeNextPath(params.get("next"));
const returnedFromProvider = params.has("code");
const urlError = params.get("error_description") || new URLSearchParams(location.hash.slice(1)).get("error_description");

let mode = "entrar";
let currentUser = null;
let currentProfile = null;
let currentPhone = "";
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
  submit.disabled = busy || !authConfigured || !valid || Boolean(needsCaptcha && !captchaToken);
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

function setMode(next, { keepStatus = false } = {}) {
  if (!MODES[next]) next = "entrar";
  if (currentUser && ["entrar", "cadastrar", "link", "redefinir"].includes(next)) next = "conta";
  if (!currentUser && next === "conta") next = "entrar";
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
  form.hidden = mode === "conta";
  if (config.passwordAutocomplete) fields.password.input.autocomplete = config.passwordAutocomplete;
  fields.password.input.placeholder = mode === "entrar" ? "Senha" : "Nova senha";

  document.querySelectorAll("#auth-card [data-modes]").forEach((element) => {
    element.hidden = !element.dataset.modes.split(" ").includes(mode);
  });
  $("#auth-social").hidden = !authProviders.length || !["entrar", "cadastrar"].includes(mode);
  $("#auth-captcha").hidden = !(captchaSiteKey && CAPTCHA_MODES.has(mode));
  if (mode === "conta") void renderAccount();
  initializeTheme();

  touched.clear();
  if (!keepStatus) setStatus("");
  renderStrength();
  renderValidation();
  if (`#${mode}` !== location.hash && !(mode === "entrar" && !location.hash)) {
    history.replaceState(null, "", `${location.pathname}${location.search}#${mode}`);
  }
}

function renderAvatar(profile) {
  const name = displayName(currentUser);
  const url = profile?.avatar_url || "";
  avatarInitials.textContent = profileInitials(name, currentUser?.email);
  if (url) {
    avatarImage.hidden = false;
    avatarImage.src = url;
    avatarImage.alt = `Foto de ${name}`;
  } else {
    avatarImage.hidden = true;
    avatarImage.removeAttribute("src");
    avatarImage.alt = "";
  }
}

function revokeAvatarCropUrl() {
  if (avatarCropState.objectUrl) {
    URL.revokeObjectURL(avatarCropState.objectUrl);
    avatarCropState.objectUrl = "";
  }
}

function paintAvatarCrop() {
  if (!avatarCropImage) return;
  const { scale, offsetX, offsetY } = clampAvatarViewport(avatarCropState);
  avatarCropState.scale = scale;
  avatarCropState.offsetX = offsetX;
  avatarCropState.offsetY = offsetY;
  avatarCropImage.style.width = `${avatarCropState.imageWidth}px`;
  avatarCropImage.style.height = `${avatarCropState.imageHeight}px`;
  avatarCropImage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  if (avatarCropZoom) {
    const minScale = minCoverScale(avatarCropState.imageWidth, avatarCropState.imageHeight, avatarCropState.viewportSize);
    const ratio = Math.round((scale / minScale) * 100);
    if (Number(avatarCropZoom.value) !== ratio) avatarCropZoom.value = String(Math.min(300, Math.max(100, ratio)));
  }
}

function closeAvatarCrop() {
  if (!avatarCropDialog?.open) {
    revokeAvatarCropUrl();
    avatarCropState.file = null;
    return;
  }
  avatarCropDialog.close();
}

function resetAvatarCropSession() {
  avatarCropFrame?.classList.remove("is-dragging");
  avatarCropState.dragging = false;
  avatarCropState.pointerId = null;
  avatarCropState.file = null;
  if (avatarCropImage) {
    avatarCropImage.removeAttribute("src");
    avatarCropImage.alt = "";
  }
  revokeAvatarCropUrl();
  const focusTarget = avatarCropState.returnFocus;
  avatarCropState.returnFocus = null;
  if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
}

async function openAvatarCrop(file) {
  if (!avatarCropDialog || !avatarCropImage || !avatarCropFrame) {
    throw new Error("Não foi possível abrir o enquadramento da foto.");
  }
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new Error("A imagem precisa ter no máximo 8 MB.");

  revokeAvatarCropUrl();
  avatarCropState.file = file;
  avatarCropState.returnFocus = document.activeElement;
  avatarCropState.objectUrl = URL.createObjectURL(file);

  await new Promise((resolve, reject) => {
    const onLoad = () => {
      avatarCropImage.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      avatarCropImage.removeEventListener("load", onLoad);
      reject(new Error("Não foi possível ler a imagem selecionada."));
    };
    avatarCropImage.addEventListener("load", onLoad, { once: true });
    avatarCropImage.addEventListener("error", onError, { once: true });
    avatarCropImage.src = avatarCropState.objectUrl;
    avatarCropImage.alt = "Pré-visualização da foto de perfil";
  });

  avatarCropState.imageWidth = avatarCropImage.naturalWidth || 1;
  avatarCropState.imageHeight = avatarCropImage.naturalHeight || 1;
  avatarCropState.viewportSize = avatarCropFrame.clientWidth || 280;
  const minScale = minCoverScale(avatarCropState.imageWidth, avatarCropState.imageHeight, avatarCropState.viewportSize);
  avatarCropState.scale = minScale;
  avatarCropState.offsetX = (avatarCropState.viewportSize - avatarCropState.imageWidth * minScale) / 2;
  avatarCropState.offsetY = (avatarCropState.viewportSize - avatarCropState.imageHeight * minScale) / 2;
  paintAvatarCrop();

  if (typeof avatarCropDialog.showModal === "function") avatarCropDialog.showModal();
  else avatarCropDialog.setAttribute("open", "");
  avatarCropConfirm?.focus({ preventScroll: true });
}

function currentAvatarCropRect() {
  return cropRectFromViewport({
    imageWidth: avatarCropState.imageWidth,
    imageHeight: avatarCropState.imageHeight,
    viewportSize: avatarCropState.viewportSize,
    scale: avatarCropState.scale,
    offsetX: avatarCropState.offsetX,
    offsetY: avatarCropState.offsetY,
  });
}

function setLgpdStatus(message, tone = "info") {
  lgpdStatus.textContent = message;
  lgpdStatus.dataset.tone = tone;
}

function renderLgpd(profile) {
  if (hasCurrentConsent(profile)) {
    const when = profile.data_consent_at ? new Date(profile.data_consent_at) : null;
    setLgpdStatus(when && !Number.isNaN(when.getTime()) ? `Autorizado em ${when.toLocaleDateString("pt-BR")}.` : "");
    accountConsentInput.checked = true;
  } else {
    setLgpdStatus("");
    accountConsentInput.checked = false;
  }
}

function setPhoneError(message) {
  phoneError.textContent = message;
  phoneInput.setAttribute("aria-invalid", String(Boolean(message)));
}

function phoneErrorMessage(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  if (/22023|invalid phone/i.test(text)) return "Telefone inválido. Confira o DDD e o número.";
  if (/failed to fetch|network|load failed/i.test(text)) return authErrorMessage(error);
  return "Não foi possível salvar o telefone agora. Tente novamente.";
}

/** Re-mask while keeping the caret after the same number of digits. */
function maskPhoneInput(event) {
  const raw = phoneInput.value;
  const caret = phoneInput.selectionStart ?? raw.length;
  let digits = phoneDigits(raw);
  let digitsBeforeCaret = phoneDigits(raw.slice(0, caret)).length;
  const previousDigits = phoneDigits(phoneInput.dataset.previous || "");
  if (event?.inputType === "deleteContentBackward" && digits === previousDigits && digitsBeforeCaret > 0) {
    digits = digits.slice(0, digitsBeforeCaret - 1) + digits.slice(digitsBeforeCaret);
    digitsBeforeCaret -= 1;
  }
  const masked = formatPhoneMask(digits);
  phoneInput.value = masked;
  phoneInput.dataset.previous = masked;
  if (document.activeElement !== phoneInput) return;
  let position = 0;
  for (let seen = 0; position < masked.length && seen < digitsBeforeCaret; position += 1) {
    if (/\d/.test(masked[position])) seen += 1;
  }
  phoneInput.setSelectionRange(position, position);
}

function setPhoneValue(e164) {
  phoneInput.value = formatPhoneMask(e164 || "");
  phoneInput.dataset.previous = phoneInput.value;
}

async function renderAccount() {
  $("#auth-account-name").textContent = displayName(currentUser);
  $("#auth-account-email").textContent = currentUser?.email || "—";
  birthDateError.textContent = "";
  setPhoneError("");
  avatarStatus.textContent = "";
  const [profileResult, phoneResult] = await Promise.allSettled([getMyProfile(), getMyPhone()]);
  currentProfile = profileResult.status === "fulfilled" ? profileResult.value : null;
  currentPhone = phoneResult.status === "fulfilled" ? phoneResult.value || "" : "";
  birthDateInput.value = currentProfile?.birth_date || "";
  setPhoneValue(currentPhone);
  renderAvatar(currentProfile);
  renderLgpd(currentProfile);
  if (profileResult.status === "rejected") {
    setLgpdStatus("Não foi possível carregar o perfil agora. Você ainda pode usar o catálogo.", "error");
  } else if (phoneResult.status === "rejected") {
    setPhoneError("Não foi possível carregar o telefone salvo agora.");
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
        try { await updateMyProfile({ grantConsent: true }); } catch { /* perfil pode ser preenchido depois em Minha conta */ }
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
      currentUser = await getCurrentUser();
      setMode("conta", { keepStatus: true });
      setStatus("Senha salva com sucesso.", "success");
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
  birthDateInput?.addEventListener("change", () => {
    birthDateError.textContent = validateBirthDate(birthDateInput.value);
  });
  phoneInput?.addEventListener("input", (event) => {
    maskPhoneInput(event);
    if (phoneInput.getAttribute("aria-invalid") === "true") setPhoneError(validatePhone(phoneInput.value));
  });
  phoneInput?.addEventListener("blur", () => {
    setPhoneError(validatePhone(phoneInput.value));
  });
  accountConsentInput?.addEventListener("change", () => {
    if (lgpdStatus.dataset.tone === "error") setLgpdStatus("");
  });
  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const birthError = validateBirthDate(birthDateInput.value);
    birthDateError.textContent = birthError;
    const phoneMessage = validatePhone(phoneInput.value);
    setPhoneError(phoneMessage);
    if (birthError || phoneMessage) {
      (birthError ? birthDateInput : phoneInput).focus();
      return;
    }
    if (!accountConsentInput.checked && !hasCurrentConsent(currentProfile)) {
      setLgpdStatus("Marque a autorização para salvar seus dados.", "error");
      accountConsentInput.focus();
      return;
    }
    const phone = toE164Phone(phoneInput.value);
    const saveButton = $("#auth-profile-save");
    let profileSaved = false;
    busy = true;
    saveButton.setAttribute("aria-busy", "true");
    setStatus("");
    try {
      currentProfile = await updateMyProfile({
        birthDate: birthDateInput.value,
        grantConsent: accountConsentInput.checked,
      });
      profileSaved = true;
      renderAvatar(currentProfile);
      renderLgpd(currentProfile);
      if (phone !== currentPhone) {
        await setMyPhone(phone);
        currentPhone = phone;
        setPhoneValue(currentPhone);
      }
      setStatus("Dados salvos.", "success");
    } catch (error) {
      if (!profileSaved) {
        setStatus(authErrorMessage(error), "error");
      } else {
        const message = phoneErrorMessage(error);
        setPhoneError(message);
        setStatus(`Aniversário salvo, mas o telefone não. ${message}`, "error");
      }
    } finally {
      busy = false;
      saveButton.removeAttribute("aria-busy");
    }
  });
  avatarInput?.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    avatarInput.value = "";
    if (!file || busy) return;
    avatarStatus.textContent = "";
    try {
      await openAvatarCrop(file);
    } catch (error) {
      resetAvatarCropSession();
      avatarStatus.textContent = authErrorMessage(error);
    }
  });

  avatarCropCancel?.addEventListener("click", () => closeAvatarCrop());
  avatarCropDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAvatarCrop();
  });
  avatarCropDialog?.addEventListener("close", () => {
    resetAvatarCropSession();
  });
  avatarCropDialog?.addEventListener("click", (event) => {
    if (event.target === avatarCropDialog) closeAvatarCrop();
  });

  avatarCropZoom?.addEventListener("input", () => {
    if (!avatarCropState.file) return;
    const minScale = minCoverScale(avatarCropState.imageWidth, avatarCropState.imageHeight, avatarCropState.viewportSize);
    const nextScale = minScale * (Number(avatarCropZoom.value) / 100);
    const centerX = avatarCropState.viewportSize / 2;
    const centerY = avatarCropState.viewportSize / 2;
    const focalX = (centerX - avatarCropState.offsetX) / avatarCropState.scale;
    const focalY = (centerY - avatarCropState.offsetY) / avatarCropState.scale;
    avatarCropState.scale = nextScale;
    avatarCropState.offsetX = centerX - focalX * nextScale;
    avatarCropState.offsetY = centerY - focalY * nextScale;
    paintAvatarCrop();
  });

  avatarCropFrame?.addEventListener("pointerdown", (event) => {
    if (!avatarCropState.file || event.button !== 0) return;
    avatarCropState.dragging = true;
    avatarCropState.pointerId = event.pointerId;
    avatarCropState.startX = event.clientX;
    avatarCropState.startY = event.clientY;
    avatarCropState.originX = avatarCropState.offsetX;
    avatarCropState.originY = avatarCropState.offsetY;
    avatarCropFrame.classList.add("is-dragging");
    avatarCropFrame.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  avatarCropFrame?.addEventListener("pointermove", (event) => {
    if (!avatarCropState.dragging || event.pointerId !== avatarCropState.pointerId) return;
    avatarCropState.offsetX = avatarCropState.originX + (event.clientX - avatarCropState.startX);
    avatarCropState.offsetY = avatarCropState.originY + (event.clientY - avatarCropState.startY);
    paintAvatarCrop();
  });
  const endAvatarDrag = (event) => {
    if (!avatarCropState.dragging || (event && event.pointerId !== avatarCropState.pointerId)) return;
    avatarCropState.dragging = false;
    avatarCropState.pointerId = null;
    avatarCropFrame?.classList.remove("is-dragging");
  };
  avatarCropFrame?.addEventListener("pointerup", endAvatarDrag);
  avatarCropFrame?.addEventListener("pointercancel", endAvatarDrag);

  avatarCropConfirm?.addEventListener("click", async () => {
    const file = avatarCropState.file;
    if (!file || busy) return;
    busy = true;
    avatarCropConfirm.disabled = true;
    avatarCropCancel && (avatarCropCancel.disabled = true);
    avatarStatus.textContent = "Enviando foto…";
    try {
      const crop = currentAvatarCropRect();
      const blob = await compressAvatarFile(file, { crop });
      closeAvatarCrop();
      currentProfile = await uploadMyAvatar(blob, { compressed: true });
      renderAvatar(currentProfile);
      avatarStatus.textContent = "Foto atualizada.";
    } catch (error) {
      avatarStatus.textContent = authErrorMessage(error);
    } finally {
      busy = false;
      if (avatarCropConfirm) avatarCropConfirm.disabled = false;
      if (avatarCropCancel) avatarCropCancel.disabled = false;
    }
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
    button.hidden = !authProviders.includes(button.dataset.provider);
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

  $("#auth-signout").addEventListener("click", async () => {
    await signOut();
    currentUser = null;
    setMode("entrar", { keepStatus: true });
    setStatus("Você saiu da sua conta.", "success");
  });

  const deleteButton = $("#auth-delete");
  deleteButton.addEventListener("click", async () => {
    if (!confirm("Excluir sua conta apaga seu perfil de forma permanente. Deseja continuar?")) return;
    deleteButton.disabled = true;
    try {
      await deleteAccount();
      currentUser = null;
      setMode("entrar", { keepStatus: true });
      setStatus("Sua conta foi excluída.", "success");
    } catch (error) {
      setStatus(authErrorMessage(error), "error");
    } finally {
      deleteButton.disabled = false;
    }
  });

  window.addEventListener("hashchange", () => setMode(location.hash.slice(1)));
}

async function start() {
  persistInput.checked = getPersistSession();
  bindEvents();
  setMode(location.hash.slice(1) || "entrar");

  if (!authConfigured) {
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
      if (mode === "conta" || mode === "nova-senha") setMode("entrar", { keepStatus: true });
    } else if (event === "USER_UPDATED" || event === "SIGNED_IN") {
      currentUser = await getCurrentUser();
      if (mode === "conta") renderAccount();
    }
  });
}

void start();
