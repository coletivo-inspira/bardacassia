import { getSupabase } from "./supabase.js";
import { updateCachedSitePayload } from "./features.js";
import { getFeatures } from "../lib/feature-state.js";
import { isInspectableTable } from "../lib/admin-view.js";

function wrapError(error) {
  const wrapped = new Error(error?.message || "Falha ao comunicar com o servidor.");
  wrapped.code = error?.code || "";
  wrapped.hint = error?.hint || "";
  wrapped.status = error?.status || 0;
  return wrapped;
}

async function adminRpc(name, params = {}) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw wrapError(error);
  return data;
}

export async function adminDbOverview() {
  return (await adminRpc("admin_db_overview")) || {};
}

export async function adminSaveRuntimeParams(params = {}) {
  const args = {
    p_default_theme: params.default_theme ?? null,
    p_site_notice: params.site_notice ?? null,
    p_popular_limit: params.popular_limit ?? null,
    p_pending_expire_minutes: params.pending_expire_minutes ?? null,
    p_max_pending_per_user: params.max_pending_per_user ?? null,
    p_max_pending_total: params.max_pending_total ?? null,
    p_write_limit_per_minute: params.write_limit_per_minute ?? null,
  };
  const data = await adminRpc("admin_set_runtime_params", args);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    updateCachedSitePayload(data);
  }
  return getFeatures();
}

export async function adminListUsers({ search = "", role = "", limit = 50, offset = 0 } = {}) {
  const data = await adminRpc("admin_list_users", {
    p_search: String(search || ""),
    p_role: String(role || ""),
    p_limit: Number(limit) || 50,
    p_offset: Math.max(0, Number(offset) || 0),
  });
  return {
    total: Number(data?.total) || 0,
    counts_by_role: data?.counts_by_role || {},
    rows: Array.isArray(data?.rows) ? data.rows : [],
  };
}

export async function adminUpdateUserAccess({ userId, role, staffName = null }) {
  return adminRpc("admin_update_user_access", {
    p_user_id: userId,
    p_role: role,
    p_staff_name: staffName == null ? null : String(staffName),
  });
}

export async function adminListRequests({ status = "", search = "", origin = "", limit = 40, offset = 0 } = {}) {
  const data = await adminRpc("admin_list_requests", {
    p_status: String(status || ""),
    p_search: String(search || ""),
    p_origin: String(origin || ""),
    p_limit: Number(limit) || 40,
    p_offset: Math.max(0, Number(offset) || 0),
  });
  return {
    total: Number(data?.total) || 0,
    rows: Array.isArray(data?.rows) ? data.rows : [],
  };
}

export async function adminInspectTable({ table, search = "", limit = 30, offset = 0 }) {
  const cleanTable = String(table || "").trim().toLowerCase();
  if (!isInspectableTable(cleanTable)) {
    const err = new Error("Tabela fora da lista permitida.");
    err.code = "22023";
    throw err;
  }
  const data = await adminRpc("admin_inspect_table", {
    p_table: cleanTable,
    p_search: String(search || ""),
    p_limit: Number(limit) || 30,
    p_offset: Math.max(0, Number(offset) || 0),
  });
  return {
    table: data?.table || cleanTable,
    total: Number(data?.total) || 0,
    columns: Array.isArray(data?.columns) ? data.columns : [],
    rows: Array.isArray(data?.rows) ? data.rows : [],
  };
}

export async function adminListAuditLogs({ category = "", search = "", limit = 50, offset = 0 } = {}) {
  const data = await adminRpc("admin_list_audit_logs", {
    p_category: String(category || ""),
    p_search: String(search || ""),
    p_limit: Number(limit) || 50,
    p_offset: Math.max(0, Number(offset) || 0),
  });
  return {
    total: Number(data?.total) || 0,
    rows: Array.isArray(data?.rows) ? data.rows : [],
  };
}
