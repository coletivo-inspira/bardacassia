/** Pure helpers for discovery-card swipe (Tinder-like, cross-device). */

export const SWIPE = {
  /** px before deciding horizontal vs vertical intent */
  lockPx: 8,
  /** horizontal must beat vertical by this ratio to lock */
  lockRatio: 1.15,
  /** commit distance as fraction of card width */
  commitRatio: 0.2,
  commitMinPx: 48,
  commitMaxPx: 96,
  /** px/ms — flick commits even below distance threshold */
  velocityCommit: 0.4,
  /** visual full-strength badge distance */
  strengthPx: 72,
};

export function swipeDelta(start, clientX, clientY) {
  return {
    dx: clientX - start.x,
    dy: clientY - start.y,
  };
}

/**
 * @returns {"horizontal"|"vertical"|null}
 */
export function resolveSwipeAxis(dx, dy, { lockPx = SWIPE.lockPx, lockRatio = SWIPE.lockRatio } = {}) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < lockPx && ay < lockPx) return null;
  if (ay >= lockPx && ay > ax * lockRatio) return "vertical";
  if (ax >= lockPx && ax >= ay * lockRatio) return "horizontal";
  return null;
}

export function commitThreshold(cardWidth, {
  commitRatio = SWIPE.commitRatio,
  commitMinPx = SWIPE.commitMinPx,
  commitMaxPx = SWIPE.commitMaxPx,
} = {}) {
  const width = Math.max(0, Number(cardWidth) || 0);
  return Math.min(commitMaxPx, Math.max(commitMinPx, width * commitRatio));
}

/**
 * @param {{ dx: number, elapsedMs: number, cardWidth: number }} args
 */
export function shouldCommitSwipe({ dx, elapsedMs, cardWidth, velocityCommit = SWIPE.velocityCommit } = {}) {
  const distance = Math.abs(dx);
  const threshold = commitThreshold(cardWidth);
  if (distance >= threshold) return true;
  const dt = Math.max(elapsedMs || 0, 1);
  const velocity = distance / dt;
  // Only count velocity for a real flick (some movement, short duration)
  return distance >= lockFloor() && elapsedMs > 0 && elapsedMs < 320 && velocity >= velocityCommit;
}

function lockFloor() {
  return SWIPE.lockPx * 2;
}

export function swipeActionFromDx(dx) {
  return dx > 0 ? "choose" : "pass";
}

export function swipeStrength(dx, strengthPx = SWIPE.strengthPx) {
  return Math.min(Math.abs(dx) / strengthPx, 1);
}

export function isInteractiveSwipeTarget(target) {
  return Boolean(target?.closest?.("button, a, input, textarea, select, label, [role='button']"));
}
