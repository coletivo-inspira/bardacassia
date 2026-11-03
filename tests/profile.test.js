import test from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_JPEG_QUALITY,
  AVATAR_OUTPUT_SIZE,
  clampAvatarViewport,
  cropRectFromViewport,
  DATA_CONSENT_VERSION,
  defaultSquareCrop,
  minCoverScale,
  normalizeSquareCrop,
  profileInitials,
  validateBirthDate,
} from "../src/lib/profile.js";

test("validateBirthDate aceita vazio e data válida", () => {
  assert.equal(validateBirthDate(""), "");
  assert.equal(validateBirthDate("1990-05-20"), "");
});

test("validateBirthDate rejeita futuro, formato inválido e idade muito baixa", () => {
  assert.match(validateBirthDate("20/05/1990"), /AAAA-MM-DD/);
  assert.match(validateBirthDate("1899-12-31"), /válida/);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const future = tomorrow.toISOString().slice(0, 10);
  assert.match(validateBirthDate(future), /futuro/);
  const recent = new Date();
  recent.setFullYear(recent.getFullYear() - 5);
  const young = recent.toISOString().slice(0, 10);
  assert.match(validateBirthDate(young), /10 anos/);
});

test("profileInitials usa nome ou e-mail", () => {
  assert.equal(profileInitials("Felipe Atenesi"), "FA");
  assert.equal(profileInitials("", "pessoa@example.com"), "P");
  assert.equal(profileInitials("", ""), "?");
});

test("versão LGPD atual está definida", () => {
  assert.equal(DATA_CONSENT_VERSION, "2026-11");
});

test("avatar JPEG defaults are square 320 at ~0.72 quality", () => {
  assert.equal(AVATAR_OUTPUT_SIZE, 320);
  assert.equal(AVATAR_JPEG_QUALITY, 0.72);
});

test("defaultSquareCrop centers on the shortest side", () => {
  assert.deepEqual(defaultSquareCrop(800, 600), { sx: 100, sy: 0, sw: 600, sh: 600 });
  assert.deepEqual(defaultSquareCrop(400, 800), { sx: 0, sy: 200, sw: 400, sh: 400 });
  assert.deepEqual(defaultSquareCrop(320, 320), { sx: 0, sy: 0, sw: 320, sh: 320 });
});

test("normalizeSquareCrop clamps invalid or oversized regions", () => {
  assert.deepEqual(normalizeSquareCrop(800, 600, null), defaultSquareCrop(800, 600));
  assert.deepEqual(normalizeSquareCrop(800, 700, { sx: -40, sy: 10, sw: 600, sh: 600 }), {
    sx: 0,
    sy: 10,
    sw: 600,
    sh: 600,
  });
  assert.deepEqual(normalizeSquareCrop(500, 500, { sx: 200, sy: 200, sw: 400, sh: 400 }), {
    sx: 100,
    sy: 100,
    sw: 400,
    sh: 400,
  });
});

test("minCoverScale and viewport helpers keep the frame covered", () => {
  assert.equal(minCoverScale(800, 600, 280), 280 / 600);
  const clamped = clampAvatarViewport({
    imageWidth: 800,
    imageHeight: 600,
    viewportSize: 280,
    scale: 280 / 600,
    offsetX: 50,
    offsetY: -20,
  });
  assert.equal(clamped.scale, 280 / 600);
  assert.equal(clamped.offsetY, 0);
  assert.ok(clamped.offsetX <= 0);
  assert.ok(clamped.offsetX >= 280 - 800 * clamped.scale);

  const crop = cropRectFromViewport({
    imageWidth: 800,
    imageHeight: 600,
    viewportSize: 280,
    scale: 280 / 600,
    offsetX: (280 - 800 * (280 / 600)) / 2,
    offsetY: 0,
  });
  assert.equal(crop.sw, crop.sh);
  assert.ok(Math.abs(crop.sw - 600) < 1e-6);
  assert.ok(Math.abs(crop.sx - 100) < 1e-6);
  assert.equal(crop.sy, 0);
});
