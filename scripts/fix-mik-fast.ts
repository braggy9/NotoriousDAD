#!/usr/bin/env npx tsx
/**
 * FAST MIK Database Fix - Build file index first, then update
 */

import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const MIK_DB_PATH = path.join(os.homedir(), 'Library/Application Support/Mixedinkey/Collection11.mikdb');
const MIK_DIR = path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed');

interface FileInfo {
  path: string;
  basename: string;
  artist?: string;
  title?: string;
  album?: string;
}

function getID3Tags(filePath: string): { artist?: string; title?: string; album?: string } | null {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format_tags=artist,title,album -of json "${filePath}"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const data = JSON.parse(output);
    const tags = data?.format?.tags || {};
    return {
      artist: tags.artist || tags.Artist || tags.ARTIST,
      title: tags.title || tags.Title || tags.TITLE,
      album: tags.album || tags.Album || tags.ALBUM
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log('⚡ FAST MIK Database Fix\n');

  const db = new Database(MIK_DB_PATH);

  // Step 1: Get empty tracks from database
  console.log('📊 Step 1: Analyzing database...');
  const emptyTracks = db.prepare(`
    SELECT Z_PK, ZNAME
    FROM ZSONG
    WHERE ZARTIST IS NULL OR ZARTIST = ''
  `).all() as Array<{ Z_PK: number; ZNAME: string }>;

  console.log(`   Found ${emptyTracks.length.toLocaleString()} tracks with empty artist\n`);

  // Step 2: Build file index
  console.log('📁 Step 2: Building file index...');
  const files = fs.readdirSync(MIK_DIR).filter(f =>
    /\.(m4a|mp3|flac|wav)$/i.test(f)
  );
  console.log(`   Found ${files.length.toLocaleString()} audio files\n`);

  // Build lookup map
  const fileMap = new Map<string, string>();
  for (const file of files) {
    const nameWithoutExt = file.replace(/\.[^.]+$/, '');
    fileMap.set(nameWithoutExt.toLowerCase(), path.join(MIK_DIR, file));
  }

  // Step 3: Process empty tracks
  console.log('🔄 Step 3: Updating database...\n');

  let successCount = 0;
  let noFileCount = 0;
  let noTagsCount = 0;

  const updateStmt = db.prepare(`
    UPDATE ZSONG
    SET ZARTIST = ?, ZALBUM = ?
    WHERE Z_PK = ?
  `);

  for (let i = 0; i < emptyTracks.length; i++) {
    const track = emptyTracks[i];

    if (i % 500 === 0) {
      const progress = ((i / emptyTracks.length) * 100).toFixed(1);
      console.log(`   ${i}/${emptyTracks.length} (${progress}%) - ✅ ${successCount} | 📂 ${noFileCount} | 🏷️ ${noTagsCount}`);
    }

    // Try to find file by track name
    const trackNameLower = track.ZNAME.toLowerCase();
    let filePath = fileMap.get(trackNameLower);

    // Try variations if not found
    if (!filePath) {
      for (const [name, path] of fileMap.entries()) {
        if (name.includes(trackNameLower) || trackNameLower.includes(name)) {
          filePath = path;
          break;
        }
      }
    }

    if (!filePath) {
      noFileCount++;
      continue;
    }

    // Read ID3 tags
    const tags = getID3Tags(filePath);
    if (!tags || !tags.artist) {
      noTagsCount++;
      continue;
    }

    // Update database
    try {
      updateStmt.run(tags.artist, tags.album || null, track.Z_PK);
      successCount++;
    } catch (error) {
      // Silently continue on error
    }
  }

  console.log(`\n✅ Final: ${emptyTracks.length}/${emptyTracks.length} (100.0%) - ✅ ${successCount} | 📂 ${noFileCount} | 🏷️ ${noTagsCount}\n`);

  // Final stats
  const hasArtistAfter = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NOT NULL AND ZARTIST <> ''").get() as { count: number };
  const totalTracks = db.prepare('SELECT COUNT(*) as count FROM ZSONG').get() as { count: number };

  console.log('📊 Final Database State:');
  console.log(`   Total tracks: ${totalTracks.count.toLocaleString()}`);
  console.log(`   With artist: ${hasArtistAfter.count.toLocaleString()} (${((hasArtistAfter.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`✅ Updated: ${successCount.toLocaleString()}`);
  console.log(`📂 File not found: ${noFileCount.toLocaleString()}`);
  console.log(`🏷️ No tags: ${noTagsCount.toLocaleString()}`);
  console.log('');
  console.log(`🎉 Improvement: ${successCount.toLocaleString()} tracks now have artist metadata!`);

  db.close();
}

main().catch(console.error);
