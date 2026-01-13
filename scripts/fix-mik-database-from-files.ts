#!/usr/bin/env npx tsx
/**
 * Fix MIK Database - Read ID3 tags from files and update database
 *
 * This fixes the core issue: files have correct ID3 tags (98% coverage)
 * but MIK's database still has 8,541+ empty artist fields (only 64.4% populated)
 */

import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const MIK_DB_PATH = path.join(os.homedir(), 'Library/Application Support/Mixedinkey/Collection11.mikdb');

interface MIKTrack {
  Z_PK: number;
  ZNAME: string;
  ZARTIST: string | null;
  ZALBUM: string | null;
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

function findFileForTrack(trackName: string, mikAnalyzedDir: string): string | null {
  try {
    // Search for file with this name
    const result = execSync(
      `find "${mikAnalyzedDir}" -type f \\( -name "*${trackName}*" -o -iname "*${trackName}*" \\) | head -1`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('🔧 MIK Database Fix - Update from File ID3 Tags\n');
  console.log('This fixes the core issue: files have correct tags but MIK database is empty\n');

  const db = new Database(MIK_DB_PATH);
  const mikAnalyzedDir = path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed');

  // Get current stats
  const totalTracks = db.prepare('SELECT COUNT(*) as count FROM ZSONG').get() as { count: number };
  const emptyArtist = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NULL OR ZARTIST = ''").get() as { count: number };

  console.log(`📊 Current Database State:`);
  console.log(`   Total tracks: ${totalTracks.count.toLocaleString()}`);
  console.log(`   Empty artist: ${emptyArtist.count.toLocaleString()} (${((emptyArtist.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log('');

  // Get tracks with empty artist
  const emptyTracks = db.prepare(`
    SELECT Z_PK, ZNAME, ZARTIST, ZALBUM
    FROM ZSONG
    WHERE ZARTIST IS NULL OR ZARTIST = ''
  `).all() as MIKTrack[];

  console.log(`🔄 Processing ${emptyTracks.length.toLocaleString()} tracks with empty artist...\n`);

  let successCount = 0;
  let failCount = 0;
  let noFileCount = 0;
  let noTagsCount = 0;

  const updateStmt = db.prepare(`
    UPDATE ZSONG
    SET ZARTIST = ?, ZALBUM = ?
    WHERE Z_PK = ?
  `);

  for (let i = 0; i < emptyTracks.length; i++) {
    const track = emptyTracks[i];

    if (i % 100 === 0) {
      const progress = ((i / emptyTracks.length) * 100).toFixed(1);
      console.log(`   ${i}/${emptyTracks.length} (${progress}%) - ✅ ${successCount} | ❌ ${failCount} | 📂 ${noFileCount} | 🏷️ ${noTagsCount}`);
    }

    // Try to find the file
    const filePath = findFileForTrack(track.ZNAME, mikAnalyzedDir);
    if (!filePath || !fs.existsSync(filePath)) {
      noFileCount++;
      continue;
    }

    // Read ID3 tags from file
    const tags = getID3Tags(filePath);
    if (!tags || !tags.artist) {
      noTagsCount++;
      continue;
    }

    // Update database
    try {
      updateStmt.run(
        tags.artist,
        tags.album || track.ZALBUM || null,
        track.Z_PK
      );
      successCount++;
    } catch (error) {
      failCount++;
    }
  }

  console.log('\n✅ Update Complete!\n');

  // Get final stats
  const emptyArtistAfter = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NULL OR ZARTIST = ''").get() as { count: number };
  const hasArtistAfter = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NOT NULL AND ZARTIST <> ''").get() as { count: number };

  console.log(`📊 Final Database State:`);
  console.log(`   Total tracks: ${totalTracks.count.toLocaleString()}`);
  console.log(`   With artist: ${hasArtistAfter.count.toLocaleString()} (${((hasArtistAfter.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log(`   Empty artist: ${emptyArtistAfter.count.toLocaleString()} (${((emptyArtistAfter.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`✅ Successfully updated: ${successCount.toLocaleString()}`);
  console.log(`📂 File not found: ${noFileCount.toLocaleString()}`);
  console.log(`🏷️ No tags in file: ${noTagsCount.toLocaleString()}`);
  console.log(`❌ Failed: ${failCount.toLocaleString()}`);
  console.log('');

  const improvement = emptyArtist.count - emptyArtistAfter.count;
  console.log(`🎉 Improvement: ${improvement.toLocaleString()} tracks now have artist metadata!`);
  console.log(`🎯 Target achieved: ${((hasArtistAfter.count / totalTracks.count) * 100).toFixed(1)}% coverage`);

  db.close();
}

main().catch(console.error);
