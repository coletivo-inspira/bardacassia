/** Regras de carga das flags do site. Importável no Node: não lê import.meta.env. */

/** Os três painéis da equipe dividem o claro/noturno salvo em bdc-admin-surface-v1. */
export const STAFF_PANEL_CLASSES = ["panel-page", "admin-page", "manager-page", "staff-page"];

export function isStaffPanel(doc = globalThis.document) {
  const classes = doc?.body?.classList;
  if (!classes?.contains) return false;
  return STAFF_PANEL_CLASSES.some((name) => classes.contains(name));
}

export function shouldApplySiteDefaultTheme(doc = globalThis.document) {
  if (!doc?.body) return true;
  return !isStaffPanel(doc);
}

/** {} ou ausente significa que o admin não personalizou nada. */
export function isEmptyPalette(palette) {
  if (!palette || typeof palette !== "object" || Array.isArray(palette)) return true;
  return Object.keys(palette).length === 0;
}

/**
 * `request` devolve { status: "ok", data }, { status: "off" } (sem Supabase)
 * ou { status: "error" }. Falhas não ficam guardadas: a próxima chamada tenta de novo.
 */
export function createSiteFeaturesLoader({ request, adopt, clearPalette, getFeatures }) {
  let loading = null;
  return function load() {
    loading ??= (async () => {
      let result;
      try {
        result = await request();
      } catch {
        result = { status: "error" };
      }
      if (result?.status === "ok") {
        adopt(result.data);
      } else if (result?.status === "off") {
        clearPalette();
      } else {
        loading = null;
      }
      return getFeatures();
    })();
    return loading;
  };
}
