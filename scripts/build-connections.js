#!/usr/bin/env node
/**
 * Build offline song-to-song connections from the karaoke catalog + curated genres.
 *
 * Usage:
 *   node scripts/build-connections.js
 *   node scripts/build-connections.js --limit 12
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSongConnections } from "../src/lib/connections.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const jsonPath = join(root, "public", "data", "songs.json");
const outPath = join(root, "public", "data", "song-connections.json");

function parseArgs(argv) {
  const args = { limit: 12 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") args.limit = Math.max(1, Number(argv[++i]) || 12);
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node scripts/build-connections.js [--limit N]");
      process.exit(0);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(jsonPath)) throw new Error(`Missing ${jsonPath}`);
  const songs = JSON.parse(readFileSync(jsonPath, "utf8"));
  const connections = buildSongConnections(songs, { limit: args.limit });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(connections)}\n`, "utf8");
  const edges = Object.values(connections).reduce((sum, list) => sum + list.length, 0);
  console.log(`Wrote ${outPath} (${Object.keys(connections).length} songs, ${edges} edges, limit ${args.limit})`);
}

main();
