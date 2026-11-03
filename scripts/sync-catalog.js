import { readFile } from "node:fs/promises";

const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("Supabase não configurado; sincronização do catálogo ignorada.");
  process.exit(0);
}
const songs = JSON.parse(await readFile(new URL("../public/data/songs.json", import.meta.url), "utf8"));
const codes = [...new Map(songs.map((song) => [String(song.code), {
  code: String(song.code), title: String(song.title || ""), artist: String(song.artist || ""),
}])).values()];
const response = await fetch(`${url}/rest/v1/rpc/sync_catalog_codes`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_codes: codes }),
});
if (!response.ok) {
  const body = await response.text();
  // Fresh projects need migrations first (Actions → Deploy Supabase). Don't block Pages deploy.
  if (response.status === 404 && body.includes("sync_catalog_codes")) {
    console.warn(`RPC sync_catalog_codes ainda não existe neste projeto (${response.status}). Rode o workflow Deploy Supabase e tente de novo.`);
    console.warn(body);
    process.exit(0);
  }
  throw new Error(`Falha ao sincronizar o catálogo no Supabase (${response.status}): ${body}`);
}
console.log(`${codes.length} códigos ativos sincronizados com o Supabase.`);
