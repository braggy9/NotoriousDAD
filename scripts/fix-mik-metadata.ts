#!/usr/bin/env npx tsx

/**
 * Fix MIK Metadata - Extract Artist from Track Name
 *
 * For tracks where ZARTIST is empty but ZNAME contains "Artist - Track",
 * this script parses the name and updates both fields in the MIK database.
 */

import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";

const MIK_DB_PATH = join(homedir(), "Library/Application Support/Mixedinkey/Collection11.mikdb");

interface TrackToFix {
  pk: number;
  name: string;
  artist: string;
  title: string;
}

/**
 * Parse "Artist - Track" format
 */
function parseArtistTrack(fullName: string): { artist: string; title: string } | null {
  // Remove leading track numbers
  const withoutNumber = fullName.replace(/^\d+\s*[-.]?\s*/, "");

  // Check if contains " - "
  if (!withoutNumber.includes(" - ")) {
    return null;
  }

  // Split on first " - "
  const dashIndex = withoutNumber.indexOf(" - ");
  const artist = withoutNumber.substring(0, dashIndex).trim();
  const title = withoutNumber.substring(dashIndex + 3).trim();

  // Validate
  if (!artist || !title || artist.length < 2) {
    return null;
  }

  // Skip if "artist" looks like a track number
  if (/^\d+$/.test(artist)) {
    return null;
  }

  return { artist, title };
}

/**
 * Execute SQL query
 */
function queryMIK(sql: string): string {
  try {
    return execSync(`sqlite3 "${MIK_DB_PATH}" "${sql}"`, {
      encoding: "utf-8",
      timeout: 60000,
    }).trim();
  } catch (error) {
    console.error("Database query failed:", error);
    return "";
  }
}

/**
 * Main fix logic
 */
function fixMIKMetadata() {
  console.log("\n🔧 Fixing MIK Metadata - Extract Artist from Track Name\n");
  console.log("=".repeat(50));

  // Step 1: Find tracks with missing artist
  console.log("\n📊 Finding tracks with missing artist...");

  const result = queryMIK(`
    SELECT Z_PK, ZNAME
    FROM ZSONG
    WHERE ZANALYSISDATE IS NOT NULL
      AND (ZARTIST IS NULL OR ZARTIST = '')
      AND ZNAME LIKE '%-%'
  `);

  if (!result) {
    console.log("  No tracks found to fix");
    return;
  }

  const rows = result.split("\n").filter(Boolean);
  console.log(`  ✓ Found ${rows.length} potential tracks`);

  // Step 2: Parse and validate
  console.log("\n🔍 Parsing artist/title from track names...");

  const tracksToFix: TrackToFix[] = [];

  for (const row of rows) {
    const [pk, name] = row.split("|");
    const parsed = parseArtistTrack(name);

    if (parsed) {
      tracksToFix.push({
        pk: parseInt(pk),
        name,
        artist: parsed.artist,
        title: parsed.title,
      });
    }
  }

  console.log(`  ✓ Successfully parsed ${tracksToFix.length}/${rows.length} tracks`);

  if (tracksToFix.length === 0) {
    console.log("\n  No tracks to fix");
    return;
  }

  // Step 3: Show sample
  console.log("\n📝 Sample fixes (first 10):");
  tracksToFix.slice(0, 10).forEach((track, i) => {
    console.log(`  ${i + 1}. "${track.name}"`);
    console.log(`     → Artist: "${track.artist}"`);
    console.log(`     → Title:  "${track.title}"`);
  });

  // Step 4: Create backup
  console.log("\n💾 Creating database backup...");
  const backupPath = MIK_DB_PATH + ".backup-" + Date.now();
  execSync(`cp "${MIK_DB_PATH}" "${backupPath}"`);
  console.log(`  ✓ Backup created: ${backupPath}`);

  // Step 5: Update database
  console.log("\n✏️  Updating MIK database...");

  let updated = 0;
  for (const track of tracksToFix) {
    // Escape single quotes for SQL
    const artistEscaped = track.artist.replace(/'/g, "''");
    const titleEscaped = track.title.replace(/'/g, "''");

    try {
      queryMIK(`
        UPDATE ZSONG
        SET ZARTIST = '${artistEscaped}',
            ZNAME = '${titleEscaped}'
        WHERE Z_PK = ${track.pk}
      `);
      updated++;

      if (updated % 100 === 0) {
        console.log(`  Progress: ${updated}/${tracksToFix.length}...`);
      }
    } catch (error) {
      console.error(`  ⚠️  Failed to update track ${track.pk}:`, error);
    }
  }

  console.log(`  ✓ Updated ${updated} tracks`);

  // Step 6: Verify
  console.log("\n✅ Verification...");
  const afterCount = queryMIK(`
    SELECT COUNT(*) FROM ZSONG
    WHERE ZANALYSISDATE IS NOT NULL
      AND ZARTIST IS NOT NULL
      AND ZARTIST != ''
  `);

  console.log(`  ✓ Tracks with artist: ${afterCount}`);

  console.log("\n" + "=".repeat(50));
  console.log("✅ METADATA FIX COMPLETE");
  console.log("=".repeat(50));
  console.log(`  Tracks updated:     ${updated}`);
  console.log(`  Backup location:    ${backupPath}`);
  console.log("");
  console.log("Next step:");
  console.log("  Re-run: npm run sync-mix-generator");
  console.log("  Expected: ~${parseInt(afterCount) + updated} tracks matched to Spotify");
  console.log("");
}

// Run
fixMIKMetadata();
