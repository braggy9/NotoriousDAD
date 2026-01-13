#!/usr/bin/env npx tsx

/**
 * Fast Batch Tag - Update ID3 Tags from Filenames
 * Simple version using execSync with proper escaping
 */

import { execSync } from "child_process";
import { readdirSync, writeFileSync, unlinkSync, existsSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const MIK_DIR = join(
  homedir(),
  "Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed"
);

interface ParsedFile {
  path: string;
  filename: string;
  artist: string;
  title: string;
}

function parseFilename(filename: string): { artist: string; title: string } | null {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
  const withoutNumber = nameWithoutExt.replace(/^(\d+)\s*[-.]?\s*/, "");

  if (!withoutNumber.includes(" - ")) return null;

  const idx = withoutNumber.indexOf(" - ");
  const artist = withoutNumber.substring(0, idx).trim();
  const title = withoutNumber.substring(idx + 3).trim();

  if (!artist || !title || artist.length < 2) return null;
  if (/^\d+$/.test(artist)) return null;
  if (artist.startsWith("_")) return null;
  if (artist.toLowerCase() === "unknown artist") return null;
  if (artist.toLowerCase() === "various artists") return null;

  return { artist, title };
}

/**
 * Tag a file using execSync with proper escaping
 */
function tagFile(file: ParsedFile): { success: boolean; error?: string } {
  const tempFile = file.path + ".tmp";

  try {
    // Use execSync with shell: false equivalent by using array form via env
    // Actually, simplest is to write a temp script and execute it
    // Or just escape properly for bash

    // Escape for shell: wrap in single quotes, escape existing single quotes
    const escPath = file.path.replace(/'/g, "'\"'\"'");
    const escTemp = tempFile.replace(/'/g, "'\"'\"'");
    const escArtist = file.artist.replace(/'/g, "'\"'\"'");
    const escTitle = file.title.replace(/'/g, "'\"'\"'");

    const cmd = `ffmpeg -y -i '${escPath}' -c copy -metadata 'artist=${escArtist}' -metadata 'title=${escTitle}' '${escTemp}' 2>/dev/null`;

    execSync(cmd, { encoding: "utf-8", timeout: 60000 });

    // Check if temp file was created
    if (existsSync(tempFile)) {
      // Move using Node's fs (more reliable than shell mv)
      renameSync(tempFile, file.path);
      return { success: true };
    } else {
      return { success: false, error: "No output file created" };
    }
  } catch (error) {
    // Clean up temp file
    try { if (existsSync(tempFile)) unlinkSync(tempFile); } catch {}
    return { success: false, error: error instanceof Error ? error.message.slice(0, 80) : "Unknown error" };
  }
}

async function main() {
  console.log("\n🏷️  Fast Batch Tag - ID3 Tags from Filenames\n");
  console.log("=".repeat(60));

  console.log(`\n📂 Scanning: ${MIK_DIR}`);
  const allFiles = readdirSync(MIK_DIR);
  const audioFiles = allFiles.filter(f => /\.(m4a|mp3|flac|wav)$/i.test(f));
  console.log(`  ✓ Found ${audioFiles.length.toLocaleString()} audio files`);

  console.log("\n🔎 Parsing filenames...");
  const parseable: ParsedFile[] = [];

  for (const filename of audioFiles) {
    const parsed = parseFilename(filename);
    if (parsed) {
      parseable.push({
        path: join(MIK_DIR, filename),
        filename,
        artist: parsed.artist,
        title: parsed.title
      });
    }
  }

  console.log(`  ✓ Parseable: ${parseable.length.toLocaleString()} files`);

  const DRY_RUN = process.argv.includes("--dry-run");
  const CONFIRM = process.argv.includes("--confirm");

  if (DRY_RUN) {
    console.log("\n🔍 DRY RUN - first 10:");
    parseable.slice(0, 10).forEach((f, i) => {
      console.log(`  ${i + 1}. "${f.artist}" - "${f.title}"`);
    });
    return;
  }

  if (!CONFIRM) {
    console.log(`\n⚠️  Will modify ${parseable.length.toLocaleString()} files`);
    console.log("Run with --confirm to proceed");
    return;
  }

  console.log(`\n✏️  Tagging ${parseable.length.toLocaleString()} files...\n`);

  const result = { success: 0, failed: 0, errors: [] as string[] };
  const startTime = Date.now();

  for (let i = 0; i < parseable.length; i++) {
    const file = parseable[i];
    const res = tagFile(file);

    if (res.success) {
      result.success++;
    } else {
      result.failed++;
      if (result.errors.length < 50) {
        result.errors.push(`${file.filename}: ${res.error}`);
      }
    }

    // Progress every 100 files
    if ((i + 1) % 100 === 0 || i === parseable.length - 1) {
      const pct = ((i + 1) / parseable.length * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining = Math.ceil((parseable.length - i - 1) / rate / 60);
      console.log(`  📊 ${(i + 1).toLocaleString()}/${parseable.length.toLocaleString()} (${pct}%) - ✓${result.success} ✗${result.failed} - ~${remaining}min left`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n✅ Complete in ${elapsed} minutes!`);
  console.log(`  • Success: ${result.success.toLocaleString()}`);
  console.log(`  • Failed: ${result.failed.toLocaleString()}`);

  const reportPath = join(homedir(), "dj-mix-generator/output/tag-results.json");
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    elapsed: `${elapsed} min`,
    success: result.success,
    failed: result.failed,
    sampleErrors: result.errors
  }, null, 2));
  console.log(`\n📄 Report: ${reportPath}`);

  console.log("\n📋 Next steps:");
  console.log("  1. Open Mixed In Key → Re-scan library");
  console.log("  2. Run: npm run sync-mix-generator");
}

main().catch(console.error);
