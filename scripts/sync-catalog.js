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
if (!response.ok) throw new Error(`Falha ao sincronizar o catálogo no Supabase (${response.status}): ${await response.text()}`);
console.log(`${codes.length} códigos ativos sincronizados com o Supabase.`);
