import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_TAB_ID,
  addToTab,
  allCodes,
  clearTab,
  createTab,
  deleteTab,
  emptyFavoritesState,
  moveSong,
  removeSong,
  renameTab,
  sanitizeFavoritesState,
  tabOf,
} from "../src/lib/favorites.js";

test("migra favoritas v1 e a lista da noite para o Rascunho", () => {
  const state = sanitizeFavoritesState(["101", 102, "101"], { extraDraftCodes: ["102", "103"] });
  assert.equal(state.tabs.length, 1);
  assert.equal(state.tabs[0].id, DRAFT_TAB_ID);
  assert.equal(state.tabs[0].name, "Rascunho");
  assert.deepEqual(state.tabs[0].codes, ["101", "102", "103"]);
  assert.equal(state.active, DRAFT_TAB_ID);
});

test("garante o Rascunho como primeira aba e remove códigos fora do catálogo", () => {
  const state = sanitizeFavoritesState(
    { tabs: [{ id: "sexta", name: " Noite de sexta ", codes: ["1", "x"] }, { id: DRAFT_TAB_ID, name: "Outro", codes: ["2"] }], active: "sexta" },
    { allowed: new Set(["1", "2"]) },
  );
  assert.deepEqual(state.tabs.map(({ id, name, codes }) => [id, name, codes]), [
    [DRAFT_TAB_ID, "Rascunho", ["2"]],
    ["sexta", "Noite de sexta", ["1"]],
  ]);
  assert.equal(state.active, "sexta");
  assert.deepEqual(sanitizeFavoritesState(null), emptyFavoritesState());
});

test("salva no Rascunho, cria aba e move a música entre abas", () => {
  let state = addToTab(emptyFavoritesState(), "101");
  state = addToTab(state, "101");
  assert.deepEqual(state.tabs[0].codes, ["101"]);
  state = createTab(state, "Noite de sexta", "sexta");
  assert.equal(state.active, "sexta");
  state = moveSong(state, "101", "sexta");
  assert.equal(tabOf(state, "101").id, "sexta");
  assert.deepEqual(state.tabs[0].codes, []);
  assert.deepEqual([...allCodes(state)], ["101"]);
  assert.equal(moveSong(state, "101", "nao-existe"), state);
});

test("renomeia e apaga abas, devolvendo as músicas para o Rascunho", () => {
  let state = createTab(addToTab(emptyFavoritesState(), "1"), "Aniversário", "niver");
  state = moveSong(state, "1", "niver");
  state = renameTab(state, "niver", "Aniversário da Ana");
  assert.equal(state.tabs[1].name, "Aniversário da Ana");
  assert.equal(renameTab(state, DRAFT_TAB_ID, "Outro"), state);
  assert.equal(deleteTab(state, DRAFT_TAB_ID), state);
  state = deleteTab(state, "niver");
  assert.equal(state.tabs.length, 1);
  assert.deepEqual(state.tabs[0].codes, ["1"]);
  assert.equal(state.active, DRAFT_TAB_ID);
});

test("remove a música de qualquer aba e limpa uma aba", () => {
  let state = addToTab(addToTab(emptyFavoritesState(), "1"), "2");
  state = removeSong(state, "1");
  assert.deepEqual(state.tabs[0].codes, ["2"]);
  state = clearTab(state, DRAFT_TAB_ID);
  assert.equal(allCodes(state).size, 0);
  assert.equal(createTab(state, "   "), state);
});
