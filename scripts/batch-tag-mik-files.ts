#!/usr/bin/env npx tsx

/**
 * Batch Tag MIK Files - Add ID3 Tags from Filenames
 *
 * Scans the MIK-Analyzed folder, parses filenames to extract artist/title,
 * and writes proper ID3 tags so MIK can read the metadata.
 */

import { execSync } from "child_process";
import { readdirSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

const MIK_ANALYZED_DIR = join(
  homedir(),
  "Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed"
);

interface TrackMetadata {
  artist: string;
  title: string;
}

/**
 * Parse filename to extract artist and title
 */
function parseFilename(filename: string): TrackMetadata | null {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");

  // Remove leading track numbers (e.g., "01 ", "01. ", "01 - ")
  const withoutNumber = nameWithoutExt.replace(/^(\d+)\s*[-.]?\s*/, "");

  // Check if contains " - "
  if (!withoutNumber.includes(" - ")) {
    return null;
  }

  // Split on FIRST " - " occurrence
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

  // Skip if artist starts with underscore (temp files)
  if (artist.startsWith("_")) {
    return null;
  }

  return { artist, title };
}

/**
 * Check if file already has ID3 tags
 */
function hasID3Tags(filePath: string): boolean {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
      { encoding: "utf-8", timeout: 5000 }
    );

    const metadata = JSON.parse(result);
    const tags = metadata.format?.tags || {};

    // Check if has artist tag (case-insensitive)
    const hasArtist = Object.keys(tags).some(
      (key) => key.toLowerCase() === "artist" && tags[key]?.trim()
    );

    return hasArtist;
  } catch (error) {
    return false;
  }
}

/**
 * Write ID3 tags to file using ffmpeg
 */
function addID3Tags(filePath: string, metadata: TrackMetadata): boolean {
  try {
    const tempFile = filePath + ".tagged.tmp";

    // Escape quotes in metadata
    const artistEscaped = metadata.artist.replace(/"/g, '\\"');
    const titleEscaped = metadata.title.replace(/"/g, '\\"');

    // Build ffmpeg command
    const cmd = `ffmpeg -y -i "${filePath}" -c copy -metadata artist="${artistEscaped}" -metadata title="${titleEscaped}" "${tempFile}" 2>/dev/null`;

    execSync(cmd, { encoding: "utf-8", timeout: 30000 });

    // Replace original with tagged version
    execSync(`mv "${tempFile}" "${filePath}"`);

    return true;
  } catch (error) {
    console.error(`    ⚠️  Failed: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

/**
 * Main batch tagging logic
 */
function batchTagMIKFiles() {
  console.log("\n🏷️  Batch Tag MIK Files - Add ID3 Tags from Filenames\n");
  console.log("=".repeat(60));

  // Step 1: Check directory exists
  if (!existsSync(MIK_ANALYZED_DIR)) {
    console.error(`\n❌ MIK directory not found: ${MIK_ANALYZED_DIR}`);
    process.exit(1);
  }

  console.log(`\n📂 Scanning: ${MIK_ANALYZED_DIR}`);

  // Step 2: Get all audio files
  console.log("\n🔍 Finding audio files...");
  const allFiles = readdirSync(MIK_ANALYZED_DIR);
  const audioFiles = allFiles.filter((f) => /\.(m4a|mp3|flac|wav)$/i.test(f));

  console.log(`  ✓ Found ${audioFiles.length.toLocaleString()} audio files`);

  // Step 3: Filter files that can be parsed and don't have tags
  console.log("\n🔎 Checking which files need tagging...");

  const filesToTag: Array<{ path: string; filename: string; metadata: TrackMetadata }> = [];
  const hasTagsCount: number[] = [0]; // Use array to allow mutation in filter
  const cannotParseCount: number[] = [0];

  let checked = 0;
  for (const filename of audioFiles) {
    const filePath = join(MIK_ANALYZED_DIR, filename);

    // Parse filename
    const metadata = parseFilename(filename);
    if (!metadata) {
      cannotParseCount[0]++;
      continue;
    }

    // Check if already has tags
    if (hasID3Tags(filePath)) {
      hasTagsCount[0]++;
      continue;
    }

    filesToTag.push({ path: filePath, filename, metadata });

    checked++;
    if (checked % 1000 === 0) {
      console.log(`    Progress: ${checked.toLocaleString()}/${audioFiles.length.toLocaleString()} checked...`);
    }
  }

  console.log(`\n📊 Analysis Results:`);
  console.log(`  • Total files:        ${audioFiles.length.toLocaleString()}`);
  console.log(`  • Already have tags:  ${hasTagsCount[0].toLocaleString()}`);
  console.log(`  • Cannot parse:       ${cannotParseCount[0].toLocaleString()}`);
  console.log(`  • Need tagging:       ${filesToTag.length.toLocaleString()}`);

  if (filesToTag.length === 0) {
    console.log("\n✅ No files need tagging!");
    return;
  }

  // Step 4: Show sample
  console.log("\n📝 Sample files to tag (first 10):");
  filesToTag.slice(0, 10).forEach((file, i) => {
    console.log(`  ${i + 1}. "${file.filename}"`);
    console.log(`     → Artist: "${file.metadata.artist}"`);
    console.log(`     → Title:  "${file.metadata.title}"`);
  });

  // Step 5: Confirm with user
  console.log("\n⚠️  WARNING: This will modify ID3 tags in audio files!");
  console.log("\n❓ Do you want to proceed? Type 'yes' to continue:");

  // In non-interactive mode, exit here
  console.log("\n💡 To run in batch mode, modify script to skip confirmation.");
  console.log("\n⏸️  Paused - review the sample above and decide:");
  console.log(`   • ${filesToTag.length.toLocaleString()} files will be tagged`);
  console.log(`   • This will take ~${Math.ceil(filesToTag.length / 100)} minutes`);
  console.log(`   • Files will be modified in-place (original audio preserved)`);

  console.log("\n📋 Next steps:");
  console.log("  1. Review the sample output above");
  console.log("  2. If it looks good, edit this script:");
  console.log("     - Set CONFIRM_BATCH = true at line 200");
  console.log("  3. Re-run: npx tsx scripts/batch-tag-mik-files.ts");
  console.log("");

  // Step 6: Actually tag files (only if confirmed)
  const CONFIRM_BATCH = false; // Set to true to run batch tagging

  if (!CONFIRM_BATCH) {
    console.log("✋ Batch tagging not confirmed - exiting safely\n");
    return;
  }

  console.log("\n✏️  Tagging files...");
  let tagged = 0;
  let failed = 0;

  for (const file of filesToTag) {
    const success = addID3Tags(file.path, file.metadata);

    if (success) {
      tagged++;
    } else {
      failed++;
    }

    if (tagged % 100 === 0) {
      console.log(`  Progress: ${tagged}/${filesToTag.length} tagged...`);
    }
  }

  console.log(`\n✅ Tagging complete!`);
  console.log(`  • Successfully tagged: ${tagged.toLocaleString()}`);
  console.log(`  • Failed:              ${failed.toLocaleString()}`);

  console.log("\n📋 Next steps:");
  console.log("  1. Open Mixed In Key and let it re-scan the library");
  console.log("  2. MIK will pick up the new artist/title tags automatically");
  console.log("  3. Re-run: npm run sync-mix-generator");
  console.log("  4. Expected improvement: +thousands of Spotify matches!\n");
}

// Run
batchTagMIKFiles();
