import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveSwipeAxis,
  commitThreshold,
  shouldCommitSwipe,
  swipeActionFromDx,
  swipeStrength,
  isInteractiveSwipeTarget,
  SWIPE,
} from "../src/lib/discovery-swipe.js";

test("resolveSwipeAxis ignores jitter below lock distance", () => {
  assert.equal(resolveSwipeAxis(4, 3), null);
  assert.equal(resolveSwipeAxis(0, 0), null);
});

test("resolveSwipeAxis locks horizontal and vertical intent", () => {
  assert.equal(resolveSwipeAxis(20, 4), "horizontal");
  assert.equal(resolveSwipeAxis(-24, 8), "horizontal");
  assert.equal(resolveSwipeAxis(4, 20), "vertical");
  assert.equal(resolveSwipeAxis(10, 10), null);
});

test("commitThreshold scales with card width and stays in bounds", () => {
  assert.equal(commitThreshold(200), Math.max(SWIPE.commitMinPx, 200 * SWIPE.commitRatio));
  assert.ok(commitThreshold(80) >= SWIPE.commitMinPx);
  assert.ok(commitThreshold(800) <= SWIPE.commitMaxPx);
});

test("shouldCommitSwipe accepts distance or flick velocity", () => {
  assert.equal(shouldCommitSwipe({ dx: 80, elapsedMs: 400, cardWidth: 320 }), true);
  assert.equal(shouldCommitSwipe({ dx: 20, elapsedMs: 400, cardWidth: 320 }), false);
  assert.equal(shouldCommitSwipe({ dx: 36, elapsedMs: 60, cardWidth: 320 }), true);
  assert.equal(shouldCommitSwipe({ dx: 10, elapsedMs: 40, cardWidth: 320 }), false);
});

test("swipeActionFromDx maps direction", () => {
  assert.equal(swipeActionFromDx(12), "choose");
  assert.equal(swipeActionFromDx(-3), "pass");
});

test("swipeStrength saturates at 1", () => {
  assert.equal(swipeStrength(0), 0);
  assert.equal(swipeStrength(SWIPE.strengthPx / 2), 0.5);
  assert.equal(swipeStrength(SWIPE.strengthPx * 3), 1);
});

test("isInteractiveSwipeTarget detects buttons and links", () => {
  const root = { closest: (sel) => (sel.includes("button") ? {} : null) };
  assert.equal(isInteractiveSwipeTarget(root), true);
  assert.equal(isInteractiveSwipeTarget(null), false);
  assert.equal(isInteractiveSwipeTarget({ closest: () => null }), false);
});
