import { deleteAccount } from "./integrations/auth.js";
import { getMyPhone, getMyProfile, hasCurrentConsent, setMyPhone, updateMyProfile, uploadMyAvatar } from "./integrations/profile.js";
import { authErrorMessage } from "./lib/auth-validation.js";
import {
  AVATAR_MAX_INPUT_BYTES,
  clampAvatarViewport,
  compressAvatarFile,
  cropRectFromViewport,
  formatPhoneMask,
  minCoverScale,
  phoneDigits,
  toE164Phone,
  validateBirthDate,
  validatePhone,
} from "./lib/profile.js";

const $ = (selector) => document.querySelector(selector);

/**
 * Perfil, dados e privacidade inside the Conta hero: photo, birthday, phone, LGPD consent,
 * Salvar, Alterar senha and Excluir minha conta, plus the "Salvar as alterações?" guard.
 * `onProfile` receives every loaded or saved profile; `onDeleted` runs after the account is gone.
 */
export function createAccountEditor({ onProfile = () => {}, onDeleted = () => {} } = {}) {
  const els = {
    status: $("#conta-editor-status"),
    form: $("#conta-profile-form"),
    birthDate: $("#conta-birth-date"),
    birthDateError: $("#conta-birth-date-error"),
    phone: $("#conta-phone"),
    phoneError: $("#conta-phone-error"),
    consent: $("#conta-consent"),
    lgpdStatus: $("#conta-lgpd-status"),
    save: $("#conta-profile-save"),
    delete: $("#conta-delete"),
    avatarInput: $("#conta-avatar-input"),
    avatarStatus: $("#conta-avatar-status"),
    cropDialog: $("#conta-avatar-crop"),
    cropFrame: $("#conta-avatar-crop-frame"),
    cropImage: $("#conta-avatar-crop-image"),
    cropZoom: $("#conta-avatar-crop-zoom"),
    cropCancel: $("#conta-avatar-crop-cancel"),
    cropConfirm: $("#conta-avatar-crop-confirm"),
    unsaved: $("#conta-unsaved"),
    unsavedClose: $("#conta-unsaved-close"),
    unsavedSave: $("#conta-unsaved-save"),
    unsavedDiscard: $("#conta-unsaved-discard"),
  };
  if (!els.form) return null;

  const crop = {
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

  let user = null;
  let profile = null;
  let phone = "";
  let savedSnapshot = null;
  let leaving = false;
  let historyGuardArmed = false;
  let pendingLeave = null;
  let unsavedReturnFocus = null;
  let busy = false;
  let loadToken = 0;
  let revealStatus = false;

  /** `reveal` scrolls the message into view once the profile has loaded (e.g. "Senha salva" on arrival). */
  function setStatus(message, tone = "info", { reveal = false } = {}) {
    els.status.hidden = !message;
    els.status.textContent = message || "";
    els.status.dataset.tone = tone;
    revealStatus = reveal && Boolean(message);
  }

  function setLgpdStatus(message, tone = "info") {
    els.lgpdStatus.textContent = message;
    els.lgpdStatus.dataset.tone = tone;
  }

  function renderLgpd() {
    if (hasCurrentConsent(profile)) {
      const when = profile.data_consent_at ? new Date(profile.data_consent_at) : null;
      setLgpdStatus(when && !Number.isNaN(when.getTime()) ? `Autorizado em ${when.toLocaleDateString("pt-BR")}.` : "");
      els.consent.checked = true;
    } else {
      setLgpdStatus("");
      els.consent.checked = false;
    }
  }

  function setPhoneError(message) {
    els.phoneError.textContent = message;
    els.phone.setAttribute("aria-invalid", String(Boolean(message)));
  }

  function phoneErrorMessage(error) {
    const text = `${error?.code || ""} ${error?.message || ""}`;
    if (/22023|invalid phone/i.test(text)) return "Telefone inválido. Confira o DDD e o número.";
    if (/failed to fetch|network|load failed/i.test(text)) return authErrorMessage(error);
    return "Não foi possível salvar o telefone agora. Tente novamente.";
  }

  /** Re-mask while keeping the caret after the same number of digits. */
  function maskPhoneInput(event) {
    const input = els.phone;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    let digits = phoneDigits(raw);
    let digitsBeforeCaret = phoneDigits(raw.slice(0, caret)).length;
    const previousDigits = phoneDigits(input.dataset.previous || "");
    if (event?.inputType === "deleteContentBackward" && digits === previousDigits && digitsBeforeCaret > 0) {
      digits = digits.slice(0, digitsBeforeCaret - 1) + digits.slice(digitsBeforeCaret);
      digitsBeforeCaret -= 1;
    }
    const masked = formatPhoneMask(digits);
    input.value = masked;
    input.dataset.previous = masked;
    if (document.activeElement !== input) return;
    let position = 0;
    for (let seen = 0; position < masked.length && seen < digitsBeforeCaret; position += 1) {
      if (/\d/.test(masked[position])) seen += 1;
    }
    input.setSelectionRange(position, position);
  }

  function setPhoneValue(e164) {
    els.phone.value = formatPhoneMask(e164 || "");
    els.phone.dataset.previous = els.phone.value;
  }

  function snapshot() {
    return JSON.stringify([els.birthDate.value, phoneDigits(els.phone.value), els.consent.checked]);
  }

  function markClean() {
    savedSnapshot = snapshot();
  }

  function hasUnsavedChanges() {
    return Boolean(user) && !leaving && savedSnapshot !== null && snapshot() !== savedSnapshot;
  }

  /** Auth events re-render Conta (e.g. a token refresh on focus); keep what the person is typing. */
  async function load(nextUser) {
    if (user && nextUser && user.id === nextUser.id && hasUnsavedChanges()) return;
    user = nextUser;
    const token = ++loadToken;
    els.birthDateError.textContent = "";
    setPhoneError("");
    els.avatarStatus.textContent = "";
    savedSnapshot = null;
    const [profileResult, phoneResult] = await Promise.allSettled([getMyProfile(), getMyPhone()]);
    if (token !== loadToken || user !== nextUser) return;
    profile = profileResult.status === "fulfilled" ? profileResult.value : null;
    phone = phoneResult.status === "fulfilled" ? phoneResult.value || "" : "";
    els.birthDate.value = profile?.birth_date || "";
    setPhoneValue(phone);
    renderLgpd();
    if (profileResult.status === "rejected") {
      setLgpdStatus("Não foi possível carregar o perfil agora. Você ainda pode usar o catálogo.", "error");
    } else if (phoneResult.status === "rejected") {
      setPhoneError("Não foi possível carregar o telefone salvo agora.");
    }
    markClean();
    onProfile(profile);
    if (revealStatus && !els.status.hidden) els.status.scrollIntoView({ block: "center" });
    revealStatus = false;
  }

  function clear() {
    loadToken += 1;
    user = null;
    profile = null;
    phone = "";
    savedSnapshot = null;
    historyGuardArmed = false;
    els.form.reset();
    setPhoneValue("");
    setPhoneError("");
    els.birthDateError.textContent = "";
    setLgpdStatus("");
    els.avatarStatus.textContent = "";
    setStatus("");
  }

  /** An extra same-URL history entry lets the browser back button land on `popstate` instead of unloading. */
  function armHistoryGuard() {
    if (historyGuardArmed || !hasUnsavedChanges()) return;
    history.pushState({ bdcUnsaved: true }, "", location.href);
    historyGuardArmed = true;
  }

  /** Validates and saves Seus dados; returns whether everything was stored. */
  async function save() {
    if (busy || !user) return false;
    const birthError = validateBirthDate(els.birthDate.value);
    els.birthDateError.textContent = birthError;
    const phoneMessage = validatePhone(els.phone.value);
    setPhoneError(phoneMessage);
    if (birthError || phoneMessage) {
      (birthError ? els.birthDate : els.phone).focus();
      return false;
    }
    if (!els.consent.checked && !hasCurrentConsent(profile)) {
      setLgpdStatus("Marque a autorização para salvar seus dados.", "error");
      els.consent.focus();
      return false;
    }
    const nextPhone = toE164Phone(els.phone.value);
    let profileSaved = false;
    busy = true;
    els.save.setAttribute("aria-busy", "true");
    setStatus("");
    try {
      profile = await updateMyProfile({ birthDate: els.birthDate.value, grantConsent: els.consent.checked });
      profileSaved = true;
      renderLgpd();
      if (nextPhone !== phone) {
        await setMyPhone(nextPhone);
        phone = nextPhone;
        setPhoneValue(phone);
      }
      markClean();
      onProfile(profile);
      return true;
    } catch (error) {
      if (!profileSaved) {
        setStatus(authErrorMessage(error), "error");
      } else {
        const message = phoneErrorMessage(error);
        setPhoneError(message);
        setStatus(`Aniversário salvo, mas o telefone não. ${message}`, "error");
      }
      els.status.scrollIntoView({ block: "center", behavior: "smooth" });
      return false;
    } finally {
      busy = false;
      els.save.removeAttribute("aria-busy");
    }
  }

  function leave(action) {
    historyGuardArmed = false;
    if (action.type === "hash") {
      location.hash = action.hash;
      return;
    }
    if (action.type === "run") {
      savedSnapshot = null;
      void action.run();
      return;
    }
    leaving = true;
    if (action.type === "back") history.back();
    else location.assign(action.href);
  }

  function openUnsavedDialog(action) {
    pendingLeave = action;
    unsavedReturnFocus = document.activeElement;
    if (typeof els.unsaved.showModal === "function") els.unsaved.showModal();
    else els.unsaved.setAttribute("open", "");
    els.unsavedSave.focus();
  }

  function closeUnsavedDialog() {
    if (els.unsaved.open) els.unsaved.close();
    else els.unsaved.removeAttribute("open");
    const action = pendingLeave;
    pendingLeave = null;
    return action;
  }

  function stay() {
    const action = closeUnsavedDialog();
    if (action?.type === "back") armHistoryGuard();
    if (unsavedReturnFocus?.isConnected) unsavedReturnFocus.focus({ preventScroll: true });
    unsavedReturnFocus = null;
  }

  /** Runs `run` now, or after "Salvar as alterações?" when the form has unsaved edits (e.g. Sair). */
  function confirmLeave(run) {
    if (hasUnsavedChanges()) openUnsavedDialog({ type: "run", run });
    else void run();
  }

  function bindUnsavedGuard() {
    els.form.addEventListener("input", armHistoryGuard);
    els.form.addEventListener("change", armHistoryGuard);

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.("a[href]");
      if (!link || link.closest("#conta-unsaved") || link.target === "_blank" || link.hasAttribute("download")) return;
      if (!hasUnsavedChanges()) return;
      const url = new URL(link.href, location.href);
      const samePage = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;
      if (samePage && url.hash === location.hash) return;
      event.preventDefault();
      openUnsavedDialog(samePage && url.hash ? { type: "hash", hash: url.hash } : { type: "href", href: url.href });
    }, true);

    window.addEventListener("popstate", () => {
      if (!historyGuardArmed) return;
      historyGuardArmed = false;
      if (hasUnsavedChanges()) openUnsavedDialog({ type: "back" });
      else history.back();
    });

    window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;
      leaving = false;
      historyGuardArmed = false;
      if (user) void load(user);
    });

    window.addEventListener("beforeunload", (event) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    });

    els.unsavedClose.addEventListener("click", stay);
    els.unsaved.addEventListener("cancel", (event) => {
      event.preventDefault();
      stay();
    });
    els.unsaved.addEventListener("click", (event) => {
      if (event.target === els.unsaved) stay();
    });
    els.unsaved.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const items = [...els.unsaved.querySelectorAll("button:not([disabled])")];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    els.unsavedDiscard.addEventListener("click", () => {
      const action = closeUnsavedDialog();
      savedSnapshot = null;
      if (action) leave(action);
    });
    els.unsavedSave.addEventListener("click", async () => {
      const action = closeUnsavedDialog();
      if (await save()) {
        if (action) leave(action);
      } else if (action?.type === "back") {
        armHistoryGuard();
      }
    });
  }

  function revokeCropUrl() {
    if (crop.objectUrl) {
      URL.revokeObjectURL(crop.objectUrl);
      crop.objectUrl = "";
    }
  }

  function paintCrop() {
    const { scale, offsetX, offsetY } = clampAvatarViewport(crop);
    crop.scale = scale;
    crop.offsetX = offsetX;
    crop.offsetY = offsetY;
    els.cropImage.style.width = `${crop.imageWidth}px`;
    els.cropImage.style.height = `${crop.imageHeight}px`;
    els.cropImage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    const minScale = minCoverScale(crop.imageWidth, crop.imageHeight, crop.viewportSize);
    const ratio = Math.round((scale / minScale) * 100);
    if (Number(els.cropZoom.value) !== ratio) els.cropZoom.value = String(Math.min(300, Math.max(100, ratio)));
  }

  function closeCrop() {
    if (!els.cropDialog.open) {
      revokeCropUrl();
      crop.file = null;
      return;
    }
    els.cropDialog.close();
  }

  function resetCropSession() {
    els.cropFrame.classList.remove("is-dragging");
    crop.dragging = false;
    crop.pointerId = null;
    crop.file = null;
    els.cropImage.removeAttribute("src");
    els.cropImage.alt = "";
    revokeCropUrl();
    const focusTarget = crop.returnFocus;
    crop.returnFocus = null;
    if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
  }

  async function openCrop(file) {
    if (!String(file.type || "").startsWith("image/")) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
    if (file.size > AVATAR_MAX_INPUT_BYTES) throw new Error("A imagem precisa ter no máximo 8 MB.");
    revokeCropUrl();
    crop.file = file;
    crop.returnFocus = document.activeElement;
    crop.objectUrl = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      const onLoad = () => {
        els.cropImage.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        els.cropImage.removeEventListener("load", onLoad);
        reject(new Error("Não foi possível ler a imagem selecionada."));
      };
      els.cropImage.addEventListener("load", onLoad, { once: true });
      els.cropImage.addEventListener("error", onError, { once: true });
      els.cropImage.src = crop.objectUrl;
      els.cropImage.alt = "Pré-visualização da foto de perfil";
    });
    if (typeof els.cropDialog.showModal === "function") els.cropDialog.showModal();
    else els.cropDialog.setAttribute("open", "");
    crop.imageWidth = els.cropImage.naturalWidth || 1;
    crop.imageHeight = els.cropImage.naturalHeight || 1;
    crop.viewportSize = els.cropFrame.clientWidth || 280;
    const minScale = minCoverScale(crop.imageWidth, crop.imageHeight, crop.viewportSize);
    crop.scale = minScale;
    crop.offsetX = (crop.viewportSize - crop.imageWidth * minScale) / 2;
    crop.offsetY = (crop.viewportSize - crop.imageHeight * minScale) / 2;
    paintCrop();
    els.cropConfirm.focus({ preventScroll: true });
  }

  function bindAvatarCrop() {
    els.avatarInput.addEventListener("change", async () => {
      const file = els.avatarInput.files?.[0];
      els.avatarInput.value = "";
      if (!file || busy) return;
      els.avatarStatus.textContent = "";
      try {
        await openCrop(file);
      } catch (error) {
        resetCropSession();
        els.avatarStatus.textContent = authErrorMessage(error);
      }
    });
    els.cropCancel.addEventListener("click", () => closeCrop());
    els.cropDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeCrop();
    });
    els.cropDialog.addEventListener("close", resetCropSession);
    els.cropDialog.addEventListener("click", (event) => {
      if (event.target === els.cropDialog) closeCrop();
    });
    els.cropZoom.addEventListener("input", () => {
      if (!crop.file) return;
      const minScale = minCoverScale(crop.imageWidth, crop.imageHeight, crop.viewportSize);
      const nextScale = minScale * (Number(els.cropZoom.value) / 100);
      const center = crop.viewportSize / 2;
      const focalX = (center - crop.offsetX) / crop.scale;
      const focalY = (center - crop.offsetY) / crop.scale;
      crop.scale = nextScale;
      crop.offsetX = center - focalX * nextScale;
      crop.offsetY = center - focalY * nextScale;
      paintCrop();
    });
    els.cropFrame.addEventListener("pointerdown", (event) => {
      if (!crop.file || event.button !== 0) return;
      crop.dragging = true;
      crop.pointerId = event.pointerId;
      crop.startX = event.clientX;
      crop.startY = event.clientY;
      crop.originX = crop.offsetX;
      crop.originY = crop.offsetY;
      els.cropFrame.classList.add("is-dragging");
      els.cropFrame.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    els.cropFrame.addEventListener("pointermove", (event) => {
      if (!crop.dragging || event.pointerId !== crop.pointerId) return;
      crop.offsetX = crop.originX + (event.clientX - crop.startX);
      crop.offsetY = crop.originY + (event.clientY - crop.startY);
      paintCrop();
    });
    const endDrag = (event) => {
      if (!crop.dragging || (event && event.pointerId !== crop.pointerId)) return;
      crop.dragging = false;
      crop.pointerId = null;
      els.cropFrame.classList.remove("is-dragging");
    };
    els.cropFrame.addEventListener("pointerup", endDrag);
    els.cropFrame.addEventListener("pointercancel", endDrag);
    els.cropConfirm.addEventListener("click", async () => {
      const file = crop.file;
      if (!file || busy) return;
      busy = true;
      els.cropConfirm.disabled = true;
      els.cropCancel.disabled = true;
      els.avatarStatus.textContent = "Enviando foto…";
      try {
        const rect = cropRectFromViewport(crop);
        const blob = await compressAvatarFile(file, { crop: rect });
        closeCrop();
        profile = await uploadMyAvatar(blob, { compressed: true });
        onProfile(profile);
        els.avatarStatus.textContent = "Foto atualizada.";
      } catch (error) {
        els.avatarStatus.textContent = authErrorMessage(error);
      } finally {
        busy = false;
        els.cropConfirm.disabled = false;
        els.cropCancel.disabled = false;
      }
    });
  }

  els.birthDate.addEventListener("change", () => {
    els.birthDateError.textContent = validateBirthDate(els.birthDate.value);
  });
  els.phone.addEventListener("input", (event) => {
    maskPhoneInput(event);
    if (els.phone.getAttribute("aria-invalid") === "true") setPhoneError(validatePhone(els.phone.value));
  });
  els.phone.addEventListener("blur", () => setPhoneError(validatePhone(els.phone.value)));
  els.consent.addEventListener("change", () => {
    if (els.lgpdStatus.dataset.tone === "error") setLgpdStatus("");
  });
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (await save()) setStatus("Dados salvos.", "success");
  });
  els.delete.addEventListener("click", () => {
    if (!confirm("Excluir sua conta apaga seu perfil de forma permanente. Deseja continuar?")) return;
    els.delete.disabled = true;
    void (async () => {
      try {
        await deleteAccount();
        clear();
        onDeleted();
      } catch (error) {
        setStatus(authErrorMessage(error), "error");
      } finally {
        els.delete.disabled = false;
      }
    })();
  });
  bindUnsavedGuard();
  bindAvatarCrop();

  return { load, clear, setStatus, hasUnsavedChanges, confirmLeave };
}
