#!/usr/bin/env node
/**
 * Backfill coverUrl + stable Deezer ids onto the karaoke catalog by Deezer search.
 * Only fills songs that do not already have coverUrl linked to their code.
 * Does not persist previewUrl (signed Deezer links expire).
 *
 * Usage:
 *   node scripts/enrich-covers.js
 *   node scripts/enrich-covers.js --limit 500 --concurrency 3
 *   node scripts/enrich-covers.js --dry-run --limit 20
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanArtist } from "../src/lib/catalog.js";
import { metaFromDeezerTrack, pickBestDeezerTrack } from "../src/lib/deezer-match.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const csvPath = join(root, "data", "musicas.csv");
const jsonPath = join(root, "public", "data", "songs.json");
const CHECKPOINT_EVERY = 100;

function parseArgs(argv) {
  const args = { limit: Infinity, concurrency: 3, dryRun: false, delayMs: 120 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") args.limit = Number(argv[++i]) || 0;
    else if (a === "--concurrency") args.concurrency = Math.max(1, Number(argv[++i]) || 1);
    else if (a === "--delay") args.delayMs = Math.max(0, Number(argv[++i]) || 0);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node scripts/enrich-covers.js [--limit N] [--concurrency N] [--delay ms] [--dry-run]");
      process.exit(0);
    }
  }
  return args;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchDeezer(song) {
  const query = `${cleanArtist(song.artist)} ${song.title}`;
  const url = new URL("https://api.deezer.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Deezer HTTP ${response.status}`);
  const data = await response.json();
  const track = pickBestDeezerTrack(data?.data, song);
  return metaFromDeezerTrack(track);
}

function writeCsv(songs, path) {
  mkdirSync(dirname(path), { recursive: true });
  const header = "code,artist,title,lyricStart,lang,coverUrl,previewUrl,deezerId,deezerArtistId,duration";
  const lines = songs.map((s) =>
    [
      s.code,
      s.artist,
      s.title,
      s.lyricStart,
      s.lang,
      s.coverUrl || "",
      "",
      s.deezerId || "",
      s.deezerArtistId || "",
      s.duration != null ? s.duration : "",
    ]
      .map(csvEscape)
      .join(",")
  );
  writeFileSync(path, `${header}\n${lines.join("\n")}\n`, "utf8");
}

function writeJson(songs, path) {
  mkdirSync(dirname(path), { recursive: true });
  const body = `[\n${songs.map((s) => JSON.stringify(s)).join(",\n")}\n]\n`;
  writeFileSync(path, body, "utf8");
}

function persistCatalog(songs) {
  writeCsv(songs, csvPath);
  writeJson(songs, jsonPath);
}

async function mapPool(items, concurrency, worker) {
  let index = 0;
  const results = new Array(items.length);
  async function run() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

function applyMeta(song, meta) {
  if (!meta?.cover && !meta?.deezerId) return false;
  delete song.previewUrl;
  let changed = false;
  if (meta.cover && !String(song.coverUrl || "").trim()) {
    song.coverUrl = meta.cover;
    changed = true;
  }
  if (meta.deezerId && !String(song.deezerId || "").trim()) {
    song.deezerId = meta.deezerId;
    changed = true;
  }
  if (meta.deezerArtistId && !String(song.deezerArtistId || "").trim()) {
    song.deezerArtistId = meta.deezerArtistId;
    changed = true;
  }
  if (meta.duration != null && song.duration == null) {
    song.duration = meta.duration;
    changed = true;
  }
  return changed;
}

function needsEnrichment(song) {
  return !String(song.coverUrl || "").trim() || !String(song.deezerId || "").trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(jsonPath)) throw new Error(`Missing ${jsonPath}`);
  const songs = JSON.parse(readFileSync(jsonPath, "utf8"));
  const missing = songs.filter(needsEnrichment);
  const batch = missing.slice(0, args.limit === Infinity ? missing.length : args.limit);

  console.log(`Catalog: ${songs.length} songs`);
  console.log(`Missing coverUrl or deezerId: ${missing.length}`);
  console.log(`Enriching: ${batch.length} (concurrency ${args.concurrency}, delay ${args.delayMs}ms)`);

  let filled = 0;
  let failed = 0;
  let empty = 0;
  let sinceCheckpoint = 0;

  await mapPool(batch, args.concurrency, async (song, i) => {
    try {
      if (args.delayMs) await sleep(args.delayMs);
      const meta = await searchDeezer(song);
      if (applyMeta(song, meta)) {
        filled += 1;
        sinceCheckpoint += 1;
      } else {
        empty += 1;
      }
    } catch (err) {
      failed += 1;
      if (failed <= 5) console.warn(`Fail ${song.code}: ${err.message || err}`);
    }
    if ((i + 1) % 50 === 0 || i + 1 === batch.length) {
      console.log(`Progress ${i + 1}/${batch.length} · filled ${filled} · empty ${empty} · fail ${failed}`);
    }
    if (!args.dryRun && sinceCheckpoint >= CHECKPOINT_EVERY) {
      persistCatalog(songs);
      console.log(`Checkpoint saved (${songs.filter((s) => s.coverUrl).length} with coverUrl)`);
      sinceCheckpoint = 0;
    }
  });

  if (!args.dryRun) {
    persistCatalog(songs);
    const withCover = songs.filter((s) => s.coverUrl).length;
    console.log(`Wrote ${csvPath}`);
    console.log(`Wrote ${jsonPath} (${withCover} songs with coverUrl)`);
  } else {
    console.log("Dry run — no files written");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
