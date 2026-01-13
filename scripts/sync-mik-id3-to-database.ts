#!/usr/bin/env node
/**
 * Sync ID3 Tags to MIK Database
 *
 * Reads ID3 tags from audio files and updates Mixed In Key's SQLite database
 * This automates the manual "Remove from Library → Re-Add" workflow
 */

import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';

const MIK_DB_PATH = path.join(
  os.homedir(),
  'Library/Application Support/Mixedinkey/Collection11.mikdb'
);

interface MIKTrack {
  Z_PK: number;
  ZLOCATION: string;
  ZARTIST: string | null;
  ZTITLE: string | null;
}

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
    console.error(`❌ Failed to read tags from ${path.basename(filePath)}: ${error}`);
    return null;
  }
}

/**
 * Parse MIK's file location format
 * Example: "file:///Users/tombragg/Library/Mobile%20Documents/..."
 */
function parseFileLocation(location: string): string | null {
  try {
    // Remove file:// prefix and decode URI components
    const decoded = decodeURIComponent(location.replace('file://', ''));
    return decoded;
  } catch {
    return null;
  }
}

async function main() {
  console.log('🎵 MIK Database ID3 Tag Sync\n');
  console.log('This will update MIK database with ID3 tags from your audio files');
  console.log('Database:', MIK_DB_PATH);
  console.log('');

  // Open database in read-write mode
  const db = new Database(MIK_DB_PATH);

  // Get stats before update
  const totalTracks = db.prepare('SELECT COUNT(*) as count FROM ZSONG').get() as { count: number };
  const emptyArtist = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NULL OR ZARTIST = ''").get() as { count: number };

  console.log(`📊 Current Status:`);
  console.log(`   Total tracks: ${totalTracks.count.toLocaleString()}`);
  console.log(`   Empty artist: ${emptyArtist.count.toLocaleString()} (${((emptyArtist.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log('');

  // Get all tracks with empty artist field
  const tracksToUpdate = db.prepare(`
    SELECT Z_PK, ZLOCATION, ZARTIST, ZTITLE
    FROM ZSONG
    WHERE ZARTIST IS NULL OR ZARTIST = ''
  `).all() as MIKTrack[];

  console.log(`🔄 Processing ${tracksToUpdate.length.toLocaleString()} tracks with empty artist...\n`);

  let successCount = 0;
  let failCount = 0;
  let noTagsCount = 0;

  const updateStmt = db.prepare(`
    UPDATE ZSONG
    SET ZARTIST = ?, ZTITLE = ?
    WHERE Z_PK = ?
  `);

  for (let i = 0; i < tracksToUpdate.length; i++) {
    const track = tracksToUpdate[i];
    const filePath = parseFileLocation(track.ZLOCATION);

    if (!filePath) {
      failCount++;
      continue;
    }

    // Progress indicator
    if (i % 100 === 0) {
      const progress = ((i / tracksToUpdate.length) * 100).toFixed(1);
      console.log(`   Progress: ${i}/${tracksToUpdate.length} (${progress}%) - ✅ ${successCount} | ❌ ${failCount} | ⚠️ ${noTagsCount}`);
    }

    // Read ID3 tags from file
    const tags = getID3Tags(filePath);

    if (!tags || (!tags.artist && !tags.title)) {
      noTagsCount++;
      continue;
    }

    try {
      // Update database with ID3 tag data
      updateStmt.run(
        tags.artist || track.ZARTIST || '',
        tags.title || track.ZTITLE || '',
        track.Z_PK
      );
      successCount++;
    } catch (error) {
      console.error(`❌ DB update failed for ${path.basename(filePath)}: ${error}`);
      failCount++;
    }
  }

  console.log('\n✅ Update Complete!\n');

  // Get stats after update
  const emptyArtistAfter = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NULL OR ZARTIST = ''").get() as { count: number };
  const hasArtistAfter = db.prepare("SELECT COUNT(*) as count FROM ZSONG WHERE ZARTIST IS NOT NULL AND ZARTIST <> ''").get() as { count: number };

  console.log(`📊 Final Status:`);
  console.log(`   Total tracks: ${totalTracks.count.toLocaleString()}`);
  console.log(`   With artist: ${hasArtistAfter.count.toLocaleString()} (${((hasArtistAfter.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log(`   Empty artist: ${emptyArtistAfter.count.toLocaleString()} (${((emptyArtistAfter.count / totalTracks.count) * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`✅ Successfully updated: ${successCount.toLocaleString()}`);
  console.log(`⚠️  No tags in file: ${noTagsCount.toLocaleString()}`);
  console.log(`❌ Failed: ${failCount.toLocaleString()}`);
  console.log('');
  console.log(`🎉 Improvement: ${emptyArtist.count - emptyArtistAfter.count} tracks now have artist metadata!`);

  db.close();
}

main().catch(console.error);
