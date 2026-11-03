/** Current LGPD consent text version stored on the profile when the person agrees. */
export const DATA_CONSENT_VERSION = "2026-11";

export function validateBirthDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "Informe a data no formato AAAA-MM-DD.";
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    return "Data de aniversário inválida.";
  }
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (raw > todayKey) return "A data de aniversário não pode ser no futuro.";
  if (raw < "1900-01-01") return "Informe uma data de aniversário válida.";
  const minAdult = new Date(today);
  minAdult.setFullYear(minAdult.getFullYear() - 10);
  const minKey = `${minAdult.getFullYear()}-${String(minAdult.getMonth() + 1).padStart(2, "0")}-${String(minAdult.getDate()).padStart(2, "0")}`;
  if (raw > minKey) return "É preciso ter pelo menos 10 anos para cadastrar a data.";
  return "";
}

export function profileInitials(name, email = "") {
  const fromName = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");
  if (fromName) return fromName.toUpperCase();
  const fromEmail = String(email || "").trim().charAt(0);
  return (fromEmail || "?").toUpperCase();
}

export function providerAvatarUrl(user) {
  const meta = user?.user_metadata || {};
  return String(meta.avatar_url || meta.picture || "").trim() || "";
}

/**
 * Compresses an image file to a JPEG blob suitable for the avatars bucket.
 * @param {File} file
 * @param {{ maxSize?: number, quality?: number }} [options]
 * @returns {Promise<Blob>}
 */
export async function compressAvatarFile(file, { maxSize = 512, quality = 0.82 } = {}) {
  if (!(file instanceof Blob)) throw new Error("Selecione uma imagem.");
  if (!String(file.type || "").startsWith("image/")) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem precisa ter no máximo 8 MB.");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem neste navegador.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Falha ao compactar a imagem."))), "image/jpeg", quality);
  });
  if (blob.size > 500 * 1024) throw new Error("A imagem ficou grande demais. Tente outra foto.");
  return blob;
}
