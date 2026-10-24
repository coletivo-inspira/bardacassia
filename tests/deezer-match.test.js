import test from "node:test";
import assert from "node:assert/strict";
import { scoreDeezerCandidate } from "../src/integrations/deezer.js";

test("casa título com subtítulo entre parênteses", () => {
  const score = scoreDeezerCandidate(
    { title: "The Kill", artist: { name: "Thirty Seconds To Mars" } },
    { title: "THE KILL (BURY ME)", artist: "30 Seconds To Mars", code: "20379" },
  );
  assert.ok(score > 0);
});

test("casa 10cc sem perder capa", () => {
  const score = scoreDeezerCandidate(
    { title: "I'm Not In Love", artist: { name: "10cc" } },
    { title: "I'M NOT IN LOVE", artist: "10cc", code: "4920" },
  );
  assert.equal(score, 4);
});

test("rejeita artista sem relação", () => {
  const score = scoreDeezerCandidate(
    { title: "The Kill", artist: { name: "Metallica" } },
    { title: "THE KILL (BURY ME)", artist: "30 Seconds To Mars", code: "20379" },
  );
  assert.equal(score, 0);
});
