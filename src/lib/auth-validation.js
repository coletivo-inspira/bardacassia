export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const EMAIL_MAX = 254;
export const NAME_MAX = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return "Informe seu e-mail.";
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return "Informe um e-mail válido.";
  return "";
}

export function passwordStrength(value) {
  const password = String(value ?? "");
  let score = 0;
  if (password.length >= PASSWORD_MIN) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

/** Login only checks presence: the server is the authority on the stored password. */
export function validateLoginPassword(value) {
  return String(value ?? "") ? "" : "Informe sua senha.";
}

export function validateNewPassword(value, { email = "" } = {}) {
  const password = String(value ?? "");
  if (!password) return "Crie uma senha.";
  if (password.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha.";
  const localPart = normalizeEmail(email).split("@")[0];
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) return "A senha não pode conter seu e-mail.";
  return "";
}

export function validateDisplayName(value) {
  const name = String(value ?? "").trim();
  if (!name) return "Informe como quer ser chamado.";
  if (name.length > NAME_MAX) return `Use no máximo ${NAME_MAX} caracteres.`;
  return "";
}

/**
 * Only same-origin relative paths are accepted so a crafted ?next= cannot
 * redirect the user to another site after login.
 */
export function safeNextPath(value, fallback = "index.html") {
  const next = String(value ?? "").trim();
  if (!next || next.length > 300) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(next) || next.startsWith("//") || next.includes("\\")) return fallback;
  if (!/^[\w./#?=&%-]+$/.test(next)) return fallback;
  return next.replace(/^\/+/, "");
}

const ERROR_MESSAGES = [
  [/invalid login credentials|invalid_credentials/i, "E-mail ou senha inválidos."],
  [/email not confirmed|email_not_confirmed/i, "Confirme seu e-mail pelo link que enviamos antes de entrar."],
  [/user already registered|already been registered|user_already_exists|email_exists/i, "Não foi possível concluir o cadastro. Se você já tem conta, entre ou redefina a senha."],
  [/weak_password|password should be|pwned|leaked/i, "Essa senha é fraca ou já apareceu em vazamentos. Escolha outra."],
  [/same_password|should be different/i, "A nova senha precisa ser diferente da atual."],
  [/rate limit|too many|over_email_send_rate_limit|over_request_rate_limit/i, "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo."],
  [/captcha/i, "Confirme a verificação de segurança e tente de novo."],
  [/otp_disabled|signups not allowed|signup_disabled/i, "Esse método de acesso não está disponível no momento."],
  [/expired|otp_expired|invalid.*(token|code)|flow_state/i, "O link expirou ou já foi usado. Peça um novo."],
  [/failed to fetch|network|load failed/i, "Sem conexão com o servidor. Verifique sua internet."],
];

/** Maps Supabase errors to Portuguese without revealing whether an account exists. */
export function authErrorMessage(error) {
  const text = `${error?.code || ""} ${error?.message || error || ""}`;
  for (const [pattern, message] of ERROR_MESSAGES) if (pattern.test(text)) return message;
  return "Não foi possível concluir agora. Tente novamente.";
}
