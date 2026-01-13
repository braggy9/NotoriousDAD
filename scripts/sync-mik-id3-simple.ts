#!/usr/bin/env node
/**
 * Sync ID3 Tags to MIK Database (Simplified Approach)
 *
 * Scans audio files, reads their ID3 tags, and updates MIK database by matching track titles
 */

import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const MIK_DB_PATH = path.join(os.homedir(), 'Library/Application Support/Mixedinkey/Collection11.mikdb');
const MIK_FILES_DIR = path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed');

interface ID3Tags {
  artist?: string;
  title?: string;
}

/**
 * Extract ID3 tags from an audio file using ffprobe
 */
function getID3Tags(filePath: string): ID3Tags | null {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format_tags=artist,title -of json "${filePath}"`,
      { encoding: 'utf-8', timeout: 5000 }
    );

    const data = JSON.parse(output);
    const tags = data?.format?.tags || {};

    return {
      artist: tags.artist || tags.Artist || tags.ARTIST,
      title: tags.title || tags.Title || tags.TITLE
    };
  } catch (error) {
    return null;
  }
}

/**
 * Parse artist and title from filename
 * Handles formats like: "Artist - Title.ext", "01 Artist - Title.ext", etc.
 */
function parseFilename(filename: string): { artist?: string; title?: string } {
  const nameWithoutExt = filename.replace(/\.(m4a|mp3|flac|wav|aac|webm|part)$/i, '');

  // Remove leading track numbers like "01 ", "1-08 "
  const cleaned = nameWithoutExt.replace(/^\d+[-\s]+/, '');

  // Split on " - " to get artist and title
  const parts = cleaned.split(' - ');

  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim()
    };
  }

  return { title: cleaned };
}

async function main() {
  console.log('🎵 MIK Database ID3 Tag Sync (Simplified)\n');
  console.log('Database:', MIK_DB_PATH);
  console.log('Files Directory:', MIK_FILES_DIR);
  console.log('');

  // Open database
  const db = new Database(MIK_DB_PATH);

  // Get stats before
  const totalTracks = db.prepare('SELECT COUNT(*) as count FROM ZSONG').get() as { count: number };
  const emptyArtist = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NULL OR ZARTIST = ''").get() as { count: number };

  console.log(`📊 Current Status:`);
  console.log(`   Total tracks: ${totalTracks.count.toLocaleString()}`);
  console.log(`   Empty artist: ${emptyArtist.count.toLocaleString()} (${((emptyArtist.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log('');

  // Scan audio files
  console.log('📁 Scanning audio files...');
  const files = fs.readdirSync(MIK_FILES_DIR).filter(f =>
    /\.(m4a|mp3|flac|wav|aac)$/i.test(f)
  );
  console.log(`   Found ${files.length.toLocaleString()} audio files\n`);

  console.log('🔄 Processing files with ID3 tags...\n');

  let successCount = 0;
  let skipCount = 0;
  let noMatchCount = 0;
  let multiMatchCount = 0;

  const updateStmt = db.prepare(`
    UPDATE ZSONG
    SET ZARTIST = ?, ZALBUM = ?
    WHERE Z_PK = ?
  `);

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(MIK_FILES_DIR, filename);

    // Progress indicator
    if (i % 500 === 0) {
      const progress = ((i / files.length) * 100).toFixed(1);
      console.log(`   Progress: ${i}/${files.length} (${progress}%) - ✅ ${successCount} | ⚠️ ${skipCount} skipped | 🔍 ${noMatchCount} no match | 🔀 ${multiMatchCount} multi-match`);
    }

    // Read ID3 tags
    const tags = getID3Tags(filePath);
    if (!tags || !tags.artist) {
      skipCount++;
      continue;
    }

    // Parse title from filename for matching
    const parsed = parseFilename(filename);
    const titleToMatch = tags.title || parsed.title;

    if (!titleToMatch) {
      skipCount++;
      continue;
    }

    // Find matching database record(s) by title with empty artist
    const matches = db.prepare(`
      SELECT Z_PK, ZNAME, ZARTIST
      FROM ZSONG
      WHERE ZNAME LIKE ? AND (ZARTIST IS NULL OR ZARTIST = '')
      LIMIT 2
    `).all(`%${titleToMatch}%`) as Array<{ Z_PK: number; ZNAME: string; ZARTIST: string | null }>;

    if (matches.length === 0) {
      noMatchCount++;
      continue;
    }

    if (matches.length > 1) {
      // Multiple matches - skip to avoid wrong updates
      multiMatchCount++;
      continue;
    }

    // Single match - update it
    try {
      updateStmt.run(
        tags.artist,
        tags.album || null,
        matches[0].Z_PK
      );
      successCount++;
    } catch (error) {
      console.error(`❌ Update failed for ${filename}: ${error}`);
    }
  }

  console.log('\n✅ Update Complete!\n');

  // Get stats after
  const emptyArtistAfter = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NULL OR ZARTIST = ''").get() as { count: number };
  const hasArtistAfter = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NOT NULL AND ZARTIST <> ''").get() as { count: number };

  console.log(`📊 Final Status:`);
  console.log(`   Total tracks: ${totalTracks.count.toLocaleString()}`);
  console.log(`   With artist: ${hasArtistAfter.count.toLocaleString()} (${((hasArtistAfter.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log(`   Empty artist: ${emptyArtistAfter.count.toLocaleString()} (${((emptyArtistAfter.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`✅ Successfully updated: ${successCount.toLocaleString()}`);
  console.log(`⚠️  Skipped (no tags): ${skipCount.toLocaleString()}`);
  console.log(`🔍 No database match: ${noMatchCount.toLocaleString()}`);
  console.log(`🔀 Multiple matches: ${multiMatchCount.toLocaleString()}`);
  console.log('');

  const improvement = emptyArtist.count - emptyArtistAfter.count;
  if (improvement > 0) {
    console.log(`🎉 Improvement: ${improvement.toLocaleString()} tracks now have artist metadata!`);
  } else {
    console.log(`ℹ️  No improvement - this suggests most empty artist records don't match any files by title.`);
    console.log(`   Consider using MIK's GUI: Remove all tracks → Re-add folder for full re-import.`);
  }

  db.close();
}

main().catch(console.error);
