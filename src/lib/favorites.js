export const MAX_SYNCED_FAVORITES = 1000;

/** Union of local and account favorites, restricted to codes in the current catalog. */
export function mergeFavoriteCodes(localCodes, remoteCodes, isValidCode = () => true) {
  const merged = new Set();
  for (const code of [...(localCodes || []), ...(remoteCodes || [])]) {
    const key = String(code ?? "").trim();
    if (key && isValidCode(key)) merged.add(key);
  }
  return merged;
}

export function codesToUpload(localCodes) {
  return [...new Set([...(localCodes || [])].map(String).filter(Boolean))].slice(0, MAX_SYNCED_FAVORITES);
}

/** Favorites grouped in tabs. "Rascunho" always exists and receives new saves. */
export const DRAFT_TAB_ID = "rascunho";
const MAX_TABS = 30;
const MAX_CODES = 2000;

function draftTab(codes = []) {
  return { id: DRAFT_TAB_ID, name: "Rascunho", codes };
}

function uniqueCodes(items) {
  return Array.isArray(items)
    ? [...new Set(items.filter((item) => typeof item === "string" || typeof item === "number").map(String))].slice(0, MAX_CODES)
    : [];
}

export function emptyFavoritesState() {
  return { version: 2, tabs: [draftTab()], active: DRAFT_TAB_ID };
}

/**
 * Accepts the v2 shape or the legacy v1 array of codes. `extraDraftCodes` (the old
 * "lista da noite") is appended to Rascunho. `allowed` drops codes not in the catalog.
 */
export function sanitizeFavoritesState(value, { extraDraftCodes = [], allowed = null } = {}) {
  const keep = (codes) => (allowed ? codes.filter((code) => allowed.has(code)) : codes);
  let tabs = [];
  if (Array.isArray(value)) {
    tabs = [draftTab(uniqueCodes(value))];
  } else if (value && typeof value === "object" && Array.isArray(value.tabs)) {
    const seenIds = new Set();
    for (const tab of value.tabs.slice(0, MAX_TABS)) {
      if (!tab || typeof tab.id !== "string" || seenIds.has(tab.id)) continue;
      const name = typeof tab.name === "string" && tab.name.trim() ? tab.name.trim().slice(0, 40) : "Sem nome";
      seenIds.add(tab.id);
      tabs.push({ id: tab.id.slice(0, 60), name: tab.id === DRAFT_TAB_ID ? "Rascunho" : name, codes: uniqueCodes(tab.codes) });
    }
  }
  let draft = tabs.find((tab) => tab.id === DRAFT_TAB_ID);
  if (!draft) {
    draft = draftTab();
    tabs.unshift(draft);
  } else if (tabs[0] !== draft) {
    tabs = [draft, ...tabs.filter((tab) => tab !== draft)];
  }
  draft.codes = uniqueCodes([...draft.codes, ...uniqueCodes(extraDraftCodes)]);
  for (const tab of tabs) tab.codes = keep(tab.codes);
  const active = tabs.some((tab) => tab.id === value?.active) ? value.active : DRAFT_TAB_ID;
  return { version: 2, tabs, active };
}

export function allCodes(state) {
  return new Set(state.tabs.flatMap((tab) => tab.codes));
}

export function tabOf(state, code) {
  return state.tabs.find((tab) => tab.codes.includes(String(code))) || null;
}

export function addToTab(state, code, tabId = DRAFT_TAB_ID) {
  const key = String(code);
  const target = state.tabs.find((tab) => tab.id === tabId) || state.tabs[0];
  if (allCodes(state).has(key)) return state;
  return { ...state, tabs: state.tabs.map((tab) => (tab === target ? { ...tab, codes: [...tab.codes, key] } : tab)) };
}

export function removeSong(state, code) {
  const key = String(code);
  return { ...state, tabs: state.tabs.map((tab) => ({ ...tab, codes: tab.codes.filter((item) => item !== key) })) };
}

export function moveSong(state, code, tabId) {
  const key = String(code);
  if (!state.tabs.some((tab) => tab.id === tabId)) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      const codes = tab.codes.filter((item) => item !== key);
      return { ...tab, codes: tab.id === tabId ? [...codes, key] : codes };
    }),
  };
}

export function createTab(state, name, id = `aba-${Date.now().toString(36)}`) {
  const label = String(name || "").trim().slice(0, 40);
  if (!label || state.tabs.length >= MAX_TABS) return state;
  return { ...state, tabs: [...state.tabs, { id, name: label, codes: [] }], active: id };
}

export function renameTab(state, tabId, name) {
  const label = String(name || "").trim().slice(0, 40);
  if (!label || tabId === DRAFT_TAB_ID) return state;
  return { ...state, tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, name: label } : tab)) };
}

/** Deleting a tab returns its songs to Rascunho so nothing saved is lost. */
export function deleteTab(state, tabId) {
  const removed = state.tabs.find((tab) => tab.id === tabId);
  if (!removed || tabId === DRAFT_TAB_ID) return state;
  const tabs = state.tabs
    .filter((tab) => tab.id !== tabId)
    .map((tab) => (tab.id === DRAFT_TAB_ID ? { ...tab, codes: uniqueCodes([...tab.codes, ...removed.codes]) } : tab));
  return { ...state, tabs, active: state.active === tabId ? DRAFT_TAB_ID : state.active };
}

export function clearTab(state, tabId) {
  return { ...state, tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, codes: [] } : tab)) };
}

export function setActiveTab(state, tabId) {
  return state.tabs.some((tab) => tab.id === tabId) ? { ...state, active: tabId } : state;
}
