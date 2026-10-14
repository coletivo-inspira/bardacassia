#!/usr/bin/env node
/**
 * Import karaoke catalog from PDF or CSV into public/data/songs.json
 * and data/musicas.csv (editable source for later updates).
 *
 * Usage:
 *   npm run import-songs
 *   node scripts/import-songs.js --pdf data/lista-musica.pdf
 *   node scripts/import-songs.js --csv data/musicas.csv
 *
 * Prefers CSV when present (unless --pdf is forced). Falls back to PDF via pdftotext.
 */

import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const defaultPdf = join(root, "data", "lista-musica.pdf");
const defaultCsv = join(root, "data", "musicas.csv");
const outJson = join(root, "public", "data", "songs.json");

const LANGS = new Set(["BRA", "EUA", "JAP", "ESP", "ITA", "FRA", "ALE", "POR", "LAT", "OUT", "ING"]);

function parseArgs(argv) {
  const args = { pdf: null, csv: null, forcePdf: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--pdf") {
      args.pdf = argv[++i];
      args.forcePdf = true;
    } else if (a === "--csv") {
      args.csv = argv[++i];
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/import-songs.js [--pdf path] [--csv path]`);
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

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeSong(raw) {
  return {
    code: String(raw.code ?? "").trim(),
    artist: String(raw.artist ?? "").trim(),
    title: String(raw.title ?? "").trim(),
    lyricStart: String(raw.lyricStart ?? "").trim(),
    lang: String(raw.lang ?? "").trim().toUpperCase(),
  };
}

function isValidSong(song) {
  return song.code && song.artist && song.title && LANGS.has(song.lang);
}

function parsePdfText(text) {
  const songs = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\f/, "").replace(/\s+$/, "");
    if (!line.trim()) continue;
    // Skip PDF chrome only — avoid matching song titles/lyrics (e.g. "A LISTA" / "lista de…")
    const trimmed = line.trim();
    if (
      /^Interprete\b/i.test(trimmed) ||
      /APARELHO/i.test(trimmed) ||
      /LISTA DE MUSICAS/i.test(trimmed) ||
      /AUDIOVISUAL/i.test(trimmed) ||
      /DE KARAOKE/i.test(trimmed) ||
      /Ordem alfabetica/i.test(trimmed) ||
      /por interprete/i.test(trimmed) ||
      /Total de musicas/i.test(trimmed) ||
      /^codigo$/i.test(trimmed)
    ) {
      continue;
    }

    const langMatch = line.match(/\s+([A-Z]{3})\s*$/);
    if (!langMatch || !LANGS.has(langMatch[1])) continue;
    const lang = langMatch[1];
    const rest = line.slice(0, langMatch.index).replace(/\s+$/, "");
    const codeMatch = rest.match(/^(.+?)\s+(\d{3,6})\s+(.+)$/);
    if (!codeMatch) continue;

    const artist = codeMatch[1].trim();
    const code = codeMatch[2];
    const titleLyric = codeMatch[3].trim();
    const split = titleLyric.split(/\s{2,}/);
    let title = titleLyric;
    let lyricStart = "";
    if (split.length >= 2) {
      title = split[0].trim();
      lyricStart = split.slice(1).join(" ").trim();
    }

    const song = normalizeSong({ code, artist, title, lyricStart, lang });
    if (isValidSong(song)) songs.push(song);
  }
  return songs;
}

function extractPdf(pdfPath) {
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }
  const result = spawnSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(
      `Failed to run pdftotext (${result.error.message}). Install poppler-utils or import from CSV with --csv.`
    );
  }
  if (result.status !== 0) {
    throw new Error(`pdftotext failed: ${result.stderr || result.stdout}`);
  }
  return parsePdfText(result.stdout);
}

async function loadCsv(csvPath) {
  if (!existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }
  const songs = [];
  const rl = createInterface({ input: createReadStream(csvPath, { encoding: "utf8" }), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (!header) {
      header = cols.map((c) => c.trim().toLowerCase());
      continue;
    }
    const row = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""]));
    const song = normalizeSong({
      code: row.code ?? row.cod ?? row.codigo,
      artist: row.artist ?? row.interprete ?? row.intérprete,
      title: row.title ?? row.titulo ?? row.título,
      lyricStart: row.lyricstart ?? row.lyric_start ?? row["inicio da letra"] ?? row.inicio,
      lang: row.lang ?? row.idioma,
    });
    if (isValidSong(song)) songs.push(song);
  }
  return songs;
}

function writeCsv(songs, csvPath) {
  mkdirSync(dirname(csvPath), { recursive: true });
  const header = "code,artist,title,lyricStart,lang";
  const lines = songs.map(
    (s) =>
      [s.code, s.artist, s.title, s.lyricStart, s.lang].map(csvEscape).join(",")
  );
  writeFileSync(csvPath, `${header}\n${lines.join("\n")}\n`, "utf8");
}

function writeJson(songs, jsonPath) {
  mkdirSync(dirname(jsonPath), { recursive: true });
  // Compact single-line array for smaller git blobs / faster parse
  const body = `[\n${songs.map((s) => JSON.stringify(s)).join(",\n")}\n]\n`;
  writeFileSync(jsonPath, body, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfPath = resolve(args.pdf || defaultPdf);
  const csvPath = resolve(args.csv || defaultCsv);

  let songs;
  let source;

  // Explicit --csv wins; otherwise PDF (if present), else CSV.
  if (args.csv && !args.forcePdf) {
    songs = await loadCsv(resolve(args.csv));
    source = `csv:${resolve(args.csv)}`;
  } else if (args.forcePdf || existsSync(pdfPath)) {
    if (!existsSync(pdfPath) && args.forcePdf) {
      throw new Error(`PDF not found: ${pdfPath}`);
    }
    if (existsSync(pdfPath)) {
      songs = extractPdf(pdfPath);
      source = `pdf:${pdfPath}`;
    }
  }

  if (!songs) {
    if (existsSync(csvPath)) {
      songs = await loadCsv(csvPath);
      source = `csv:${csvPath}`;
    } else {
      throw new Error(`No catalog source found. Expected ${pdfPath} or ${csvPath}`);
    }
  }

  // Dedupe by code (keep first)
  const seen = new Set();
  const unique = [];
  for (const song of songs) {
    if (seen.has(song.code)) continue;
    seen.add(song.code);
    unique.push(song);
  }

  writeCsv(unique, csvPath);
  writeJson(unique, outJson);

  const bytes = Buffer.byteLength(readFileSync(outJson));
  const langCounts = unique.reduce((acc, s) => {
    acc[s.lang] = (acc[s.lang] || 0) + 1;
    return acc;
  }, {});

  console.log(`Imported ${unique.length} songs from ${source}`);
  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${outJson} (${(bytes / (1024 * 1024)).toFixed(2)} MB)`);
  console.log("Languages:", langCounts);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
