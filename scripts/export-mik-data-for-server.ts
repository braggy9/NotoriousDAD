#!/usr/bin/env npx tsx

/**
 * Export MIK Data for DigitalOcean Server
 *
 * Creates audio-library-analysis.json from MIK database
 * to replace aubio analysis on the server
 */

import { execSync } from "child_process";
import { writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  mikDbPath: join(homedir(), "Library/Application Support/Mixedinkey/Collection11.mikdb"),
  mikAnalyzedDir: join(homedir(), "Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed"),
  outputPath: join(homedir(), "dj-mix-generator/data/audio-library-analysis.json"),
};

// ============================================================
// Types
// ============================================================

interface AudioFile {
  filePath: string;
  fileName: string;
  fileSize: number;
}

interface MIKData {
  bpm: number;
  key: string;
  energy: number;
}

interface ServerTrack {
  id: string;
  filePath: string;
  fileName: string;
  artist: string;
  title: string;
  bpm: number;
  bpmConfidence: number;
  key: string;
  camelotKey: string;
  energy: number;
  duration: number;
  fileSize: number;
  analyzedAt: string;
}

// ============================================================
// Filename Parsing
// ============================================================

function parseFilename(filename: string): { artist: string; title: string } {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
  const withoutNumber = nameWithoutExt.replace(/^\d+\s*[-.]?\s*/, "");

  if (withoutNumber.includes(" - ")) {
    const [artist, ...titleParts] = withoutNumber.split(" - ");
    return { artist: artist.trim(), title: titleParts.join(" - ").trim() };
  }

  if (withoutNumber.includes(" _ ")) {
    const [artist, ...titleParts] = withoutNumber.split(" _ ");
    return { artist: artist.trim(), title: titleParts.join(" _ ").trim() };
  }

  return { artist: "", title: withoutNumber.trim() };
}

// ============================================================
// File Scanning
// ============================================================

function getAllAudioFiles(dir: string, maxSize: number = 20 * 1024 * 1024): AudioFile[] {
  const audioExts = [".m4a", ".mp3", ".flac", ".wav", ".aac"];
  const files: AudioFile[] = [];

  function scan(currentDir: string) {
    try {
      const entries = readdirSync(currentDir);

      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            scan(fullPath);
          } else if (stat.isFile() && stat.size <= maxSize) {
            const ext = fullPath.slice(fullPath.lastIndexOf(".")).toLowerCase();
            if (audioExts.includes(ext)) {
              files.push({
                filePath: fullPath,
                fileName: entry,
                fileSize: stat.size,
              });
            }
          }
        } catch {}
      }
    } catch (error) {
      console.error(`  ⚠️  Error scanning ${currentDir}`);
    }
  }

  scan(dir);
  return files;
}

// ============================================================
// MIK Database
// ============================================================

function queryMIK(sql: string): string {
  try {
    return execSync(`sqlite3 "${CONFIG.mikDbPath}" "${sql}"`, {
      encoding: "utf-8",
      timeout: 60000,
    }).trim();
  } catch {
    return "";
  }
}

function buildMIKLookup(): Map<string, MIKData> {
  console.log("📊 Building MIK database lookup...");

  const result = queryMIK(`
    SELECT ZNAME, ZARTIST, ZTEMPO, ZKEY, ZENERGY
    FROM ZSONG
    WHERE ZANALYSISDATE IS NOT NULL
  `);

  const lookup = new Map<string, MIKData>();

  if (!result) return lookup;

  const rows = result.split("\n").filter(Boolean);
  for (const row of rows) {
    const [name, artist, tempo, key, energy] = row.split("|");
    const lookupKey = `${(artist || "").toLowerCase()}|||${(name || "").toLowerCase()}`;

    lookup.set(lookupKey, {
      bpm: parseFloat(tempo) || 120,
      key: key || "8A",
      energy: parseFloat(energy) || 5,
    });
  }

  console.log(`  ✓ Indexed ${lookup.size} MIK tracks`);
  return lookup;
}

function findMIKData(fileName: string, lookup: Map<string, MIKData>): MIKData | null {
  const parsed = parseFilename(fileName);
  const exactKey = `${parsed.artist.toLowerCase()}|||${parsed.title.toLowerCase()}`;

  if (lookup.has(exactKey)) {
    return lookup.get(exactKey)!;
  }

  const titleOnlyKey = `|||${parsed.title.toLowerCase()}`;
  if (lookup.has(titleOnlyKey)) {
    return lookup.get(titleOnlyKey)!;
  }

  return null;
}

// ============================================================
// Main Export Logic
// ============================================================

function exportMIKDataForServer() {
  console.log("\n📤 Exporting MIK Data for DigitalOcean Server\n");
  console.log("=".repeat(50));

  // Scan all audio files under 20MB
  console.log("\n📂 Scanning MIK-Analyzed directory (files < 20MB)...");
  const files = getAllAudioFiles(CONFIG.mikAnalyzedDir);
  console.log(`  ✓ Found ${files.length} audio files under 20MB`);

  // Build MIK lookup
  const mikLookup = buildMIKLookup();

  // Match files to MIK data
  console.log("\n🔍 Matching files to MIK database...");
  const tracks: ServerTrack[] = [];
  let matched = 0;

  for (const file of files) {
    const mikData = findMIKData(file.fileName, mikLookup);

    if (mikData) {
      const parsed = parseFilename(file.fileName);

      // Generate unique ID
      const id = `track_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

      // Convert to server path (will be updated after upload)
      const serverPath = `/var/www/notorious-dad/audio-library/${file.fileName}`;

      tracks.push({
        id,
        filePath: serverPath,
        fileName: file.fileName,
        artist: parsed.artist || "Unknown Artist",
        title: parsed.title,
        bpm: mikData.bpm,
        bpmConfidence: 1.0, // MIK is highly confident
        key: mikData.key,
        camelotKey: mikData.key,
        energy: Math.round(mikData.energy),
        duration: 0, // Will be calculated by server
        fileSize: file.fileSize,
        analyzedAt: new Date().toISOString(),
      });

      matched++;

      if (matched % 1000 === 0) {
        console.log(`  Progress: ${matched} files matched...`);
      }
    }
  }

  console.log(`  ✓ Matched ${matched}/${files.length} files to MIK data`);

  // Save to file
  console.log(`\n💾 Saving to ${CONFIG.outputPath}...`);

  const output = {
    generatedAt: new Date().toISOString(),
    source: "Mixed In Key (professional analysis)",
    totalFiles: files.length,
    analyzedTracks: tracks.length,
    tracks,
  };

  writeFileSync(CONFIG.outputPath, JSON.stringify(output, null, 2));

  console.log("\n" + "=".repeat(50));
  console.log("✅ MIK DATA EXPORT COMPLETE");
  console.log("=".repeat(50));
  console.log(`  Total files scanned:   ${files.length}`);
  console.log(`  Matched to MIK data:   ${matched}`);
  console.log(`  Output file:           ${CONFIG.outputPath}`);
  console.log(`  File size:             ${(output.tracks.length * 300 / 1024).toFixed(1)} KB (estimated)`);
  console.log("");
  console.log("Next step:");
  console.log("  1. Upload audio files: ./scripts/upload-mik-to-server.sh");
  console.log("  2. Upload this data file to server's data/audio-library-analysis.json");
  console.log("");
}

// ============================================================
// Run
// ============================================================

exportMIKDataForServer();
