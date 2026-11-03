/** Current LGPD consent text version stored on the profile when the person agrees. */
export const DATA_CONSENT_VERSION = "2026-11";

/** Fixed square JPEG side length written to the avatars bucket. */
export const AVATAR_OUTPUT_SIZE = 320;

/** JPEG quality for new avatar uploads (~0.72 keeps 88px / retina crisp under the 512 KiB bucket limit). */
export const AVATAR_JPEG_QUALITY = 0.72;

/** Soft ceiling after compression; bucket allows 512 KiB. */
export const AVATAR_MAX_OUTPUT_BYTES = 500 * 1024;

/** Reject oversized source files before decode. */
export const AVATAR_MAX_INPUT_BYTES = 8 * 1024 * 1024;

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
 * Centered square that covers the image (shortest side).
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function defaultSquareCrop(imageWidth, imageHeight) {
  const width = Math.max(1, Number(imageWidth) || 1);
  const height = Math.max(1, Number(imageHeight) || 1);
  const side = Math.min(width, height);
  return {
    sx: (width - side) / 2,
    sy: (height - side) / 2,
    sw: side,
    sh: side,
  };
}

/**
 * Clamp a crop rect to a square inside the image bounds.
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {{ sx?: number, sy?: number, sw?: number, sh?: number }|null|undefined} crop
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function normalizeSquareCrop(imageWidth, imageHeight, crop) {
  const width = Math.max(1, Number(imageWidth) || 1);
  const height = Math.max(1, Number(imageHeight) || 1);
  if (!crop || typeof crop !== "object") return defaultSquareCrop(width, height);

  let sw = Number(crop.sw);
  let sh = Number(crop.sh);
  let sx = Number(crop.sx);
  let sy = Number(crop.sy);
  if (![sw, sh, sx, sy].every(Number.isFinite) || sw <= 0 || sh <= 0) {
    return defaultSquareCrop(width, height);
  }

  const side = Math.min(sw, sh, width, height);
  sx = Math.min(Math.max(0, sx), Math.max(0, width - side));
  sy = Math.min(Math.max(0, sy), Math.max(0, height - side));
  return { sx, sy, sw: side, sh: side };
}

/**
 * Minimum scale so the image covers a square viewport (like object-fit: cover).
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {number} viewportSize
 */
export function minCoverScale(imageWidth, imageHeight, viewportSize) {
  const side = Math.max(1, Number(viewportSize) || 1);
  const width = Math.max(1, Number(imageWidth) || 1);
  const height = Math.max(1, Number(imageHeight) || 1);
  return side / Math.min(width, height);
}

/**
 * Map pan/zoom of an image inside a fixed square viewport to a source crop rect.
 * `offsetX` / `offsetY` are the top-left of the scaled image relative to the viewport.
 * @param {{ imageWidth: number, imageHeight: number, viewportSize: number, scale: number, offsetX: number, offsetY: number }} params
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function cropRectFromViewport({ imageWidth, imageHeight, viewportSize, scale, offsetX, offsetY }) {
  const width = Math.max(1, Number(imageWidth) || 1);
  const height = Math.max(1, Number(imageHeight) || 1);
  const view = Math.max(1, Number(viewportSize) || 1);
  const minScale = minCoverScale(width, height, view);
  const resolvedScale = Math.max(minScale, Number(scale) || minScale);
  const ox = Number(offsetX);
  const oy = Number(offsetY);
  const safeOx = Number.isFinite(ox) ? ox : (view - width * resolvedScale) / 2;
  const safeOy = Number.isFinite(oy) ? oy : (view - height * resolvedScale) / 2;

  const side = view / resolvedScale;
  const sx = Math.min(Math.max(0, -safeOx / resolvedScale), Math.max(0, width - side));
  const sy = Math.min(Math.max(0, -safeOy / resolvedScale), Math.max(0, height - side));
  return normalizeSquareCrop(width, height, { sx, sy, sw: side, sh: side });
}

/**
 * Clamp image offsets so the square viewport stays covered.
 * @param {{ imageWidth: number, imageHeight: number, viewportSize: number, scale: number, offsetX: number, offsetY: number }} params
 * @returns {{ offsetX: number, offsetY: number, scale: number }}
 */
export function clampAvatarViewport({ imageWidth, imageHeight, viewportSize, scale, offsetX, offsetY }) {
  const width = Math.max(1, Number(imageWidth) || 1);
  const height = Math.max(1, Number(imageHeight) || 1);
  const view = Math.max(1, Number(viewportSize) || 1);
  const minScale = minCoverScale(width, height, view);
  const resolvedScale = Math.max(minScale, Number(scale) || minScale);
  const drawnW = width * resolvedScale;
  const drawnH = height * resolvedScale;
  const minX = Math.min(0, view - drawnW);
  const minY = Math.min(0, view - drawnH);
  const maxX = 0;
  const maxY = 0;
  let ox = Number(offsetX);
  let oy = Number(offsetY);
  if (!Number.isFinite(ox)) ox = (view - drawnW) / 2;
  if (!Number.isFinite(oy)) oy = (view - drawnH) / 2;
  return {
    scale: resolvedScale,
    offsetX: Math.min(maxX, Math.max(minX, ox)),
    offsetY: Math.min(maxY, Math.max(minY, oy)),
  };
}

function assertAvatarSource(file) {
  if (!(file instanceof Blob)) throw new Error("Selecione uma imagem.");
  if (!String(file.type || "").startsWith("image/")) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new Error("A imagem precisa ter no máximo 8 MB.");
}

/**
 * Compresses an image (optionally cropped) to a square JPEG for the avatars bucket.
 * @param {Blob} file
 * @param {{ maxSize?: number, quality?: number, crop?: { sx: number, sy: number, sw: number, sh: number } }} [options]
 * @returns {Promise<Blob>}
 */
export async function compressAvatarFile(file, { maxSize = AVATAR_OUTPUT_SIZE, quality = AVATAR_JPEG_QUALITY, crop } = {}) {
  assertAvatarSource(file);

  const bitmap = await createImageBitmap(file);
  const region = normalizeSquareCrop(bitmap.width, bitmap.height, crop);
  const size = Math.max(1, Math.round(Number(maxSize) || AVATAR_OUTPUT_SIZE));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("Não foi possível processar a imagem neste navegador.");
  }
  ctx.drawImage(bitmap, region.sx, region.sy, region.sw, region.sh, 0, 0, size, size);
  bitmap.close?.();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Falha ao compactar a imagem."))), "image/jpeg", quality);
  });
  if (blob.size > AVATAR_MAX_OUTPUT_BYTES) throw new Error("A imagem ficou grande demais. Tente outra foto.");
  return blob;
}
