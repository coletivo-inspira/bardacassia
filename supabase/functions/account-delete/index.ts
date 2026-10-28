import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isAllowedOrigin, json } from "../_shared/cors.ts";

const METHODS = "POST, OPTIONS";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, METHODS) });
  if (!isAllowedOrigin(request)) return json(request, { error: "origin_not_allowed" }, 403, {}, METHODS);
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405, { Allow: METHODS }, METHODS);

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return json(request, { error: "unauthorized" }, 401, {}, METHODS);

  // getUser validates the JWT against Auth instead of trusting its claims.
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return json(request, { error: "unauthorized" }, 401, {}, METHODS);
  if (user.is_anonymous) return json(request, { error: "account_required" }, 403, {}, METHODS);

  // Profiles, encrypted secrets and ranking interactions cascade from auth.users.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("account-delete failed", user.id, deleteError.message);
    return json(request, { error: "delete_failed" }, 500, {}, METHODS);
  }
  return json(request, { deleted: true }, 200, {}, METHODS);
});
