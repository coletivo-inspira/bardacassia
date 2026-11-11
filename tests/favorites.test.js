import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_TAB_ID,
  addToTab,
  allCodes,
  canClearTab,
  clearTab,
  codesToUpload,
  createTab,
  createTabWithSong,
  deleteTab,
  emptyFavoritesState,
  FAVORITES_KEY,
  LEGACY_FAVORITES_KEY,
  loadFavoritesState,
  MAX_SYNCED_FAVORITES,
  mergeFavoriteCodes,
  moveSong,
  removeSong,
  renameTab,
  sanitizeFavoritesState,
  saveFavoritesState,
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

test("remove a música de qualquer aba", () => {
  let state = addToTab(addToTab(emptyFavoritesState(), "1"), "2");
  state = removeSong(state, "1");
  assert.deepEqual(state.tabs[0].codes, ["2"]);
  assert.equal(createTab(state, "   "), state);
});

test("limpar uma aba devolve as músicas ao Rascunho sem desfavoritar", () => {
  let state = addToTab(addToTab(addToTab(emptyFavoritesState(), "1"), "2"), "3");
  state = createTab(state, "Sexta", "sexta");
  state = moveSong(moveSong(state, "2", "sexta"), "3", "sexta");
  assert.equal(canClearTab(state, "sexta"), true);
  const before = allCodes(state);
  state = clearTab(state, "sexta");
  assert.deepEqual(state.tabs.find((tab) => tab.id === "sexta").codes, []);
  assert.deepEqual(state.tabs[0].codes, ["1", "2", "3"]);
  assert.deepEqual(allCodes(state), before);
  assert.equal(state.active, "sexta");
  assert.equal(canClearTab(state, "sexta"), false);
  assert.equal(clearTab(state, "sexta"), state);
});

test("o Rascunho nunca pode ser limpo, nem quando é a única aba", () => {
  const onlyDraft = addToTab(addToTab(emptyFavoritesState(), "1"), "2");
  assert.equal(onlyDraft.tabs.length, 1);
  assert.equal(canClearTab(onlyDraft, DRAFT_TAB_ID), false);
  assert.equal(clearTab(onlyDraft, DRAFT_TAB_ID), onlyDraft);
  assert.deepEqual([...allCodes(onlyDraft)], ["1", "2"]);

  const withCustom = createTab(onlyDraft, "Sexta", "sexta");
  assert.equal(canClearTab(withCustom, DRAFT_TAB_ID), false);
  assert.equal(clearTab(withCustom, DRAFT_TAB_ID), withCustom);
  assert.equal(canClearTab(withCustom, "sexta"), false, "aba vazia não tem o que limpar");
  assert.equal(canClearTab(withCustom, "nao-existe"), false);
});

test("+ Nova aba cria a aba e a deixa ativa", () => {
  const state = createTab(addToTab(emptyFavoritesState(), "1"), "  Noite de sexta  ", "sexta");
  assert.deepEqual(state.tabs.map((tab) => tab.name), ["Rascunho", "Noite de sexta"]);
  assert.equal(state.active, "sexta");
  assert.deepEqual(state.tabs[0].codes, ["1"]);
});

test("+ Nova aba… no Mover para cria a aba com a música e mantém a aba atual", () => {
  const state = addToTab(addToTab(emptyFavoritesState(), "1"), "2");
  const next = createTabWithSong(state, "Aniversário", "2", "niver");
  assert.equal(next.active, DRAFT_TAB_ID);
  assert.deepEqual(next.tabs.map(({ id, codes }) => [id, codes]), [[DRAFT_TAB_ID, ["1"]], ["niver", ["2"]]]);
  assert.equal(createTabWithSong(state, "   ", "2"), state);
});

test("merges local and account favorites without duplicates", () => {
  const merged = mergeFavoriteCodes(new Set(["1001", "1002"]), ["1002", "2001"]);
  assert.deepEqual([...merged].sort(), ["1001", "1002", "2001"]);
});

test("drops codes that are no longer in the catalog", () => {
  const catalog = new Set(["1001", "2001"]);
  const merged = mergeFavoriteCodes(["1001", "9999"], ["2001", "", null], (code) => catalog.has(code));
  assert.deepEqual([...merged].sort(), ["1001", "2001"]);
});

test("normalizes numeric codes to strings", () => {
  assert.deepEqual([...mergeFavoriteCodes([1001], [" 1001 "])], ["1001"]);
});

test("upload list is unique and capped", () => {
  assert.deepEqual(codesToUpload(["1", "1", "2", ""]), ["1", "2"]);
  const many = Array.from({ length: MAX_SYNCED_FAVORITES + 50 }, (_, i) => String(i));
  assert.equal(codesToUpload(many).length, MAX_SYNCED_FAVORITES);
});

function memoryStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test("catálogo e favoritos.html leem e gravam as mesmas abas", () => {
  const storage = memoryStorage();
  const state = createTab(addToTab(emptyFavoritesState(), "101"), "Sexta", "aba-sexta");
  assert.equal(saveFavoritesState(state, storage), true);
  assert.deepEqual(loadFavoritesState(storage), sanitizeFavoritesState(JSON.parse(storage.data.get(FAVORITES_KEY))));
  assert.equal(loadFavoritesState(storage).tabs[1].name, "Sexta");
});

test("sem v2 salvo, migra a lista v1", () => {
  const storage = memoryStorage({ [LEGACY_FAVORITES_KEY]: JSON.stringify(["7", "8"]) });
  assert.deepEqual(loadFavoritesState(storage).tabs[0].codes, ["7", "8"]);
});

test("armazenamento bloqueado não quebra as favoritas", () => {
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadFavoritesState(blocked), emptyFavoritesState());
  assert.equal(saveFavoritesState(emptyFavoritesState(), blocked), false);
});
