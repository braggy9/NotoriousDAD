import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

const CLOUD_LIBRARY_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis.json');
const AUDIO_DIR = path.join(process.cwd(), 'audio-library');

function checkFfprobe(): { installed: boolean; version?: string; error?: string } {
  try {
    const result = execSync('ffprobe -version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    const versionLine = result.split('\n')[0];
    return { installed: true, version: versionLine };
  } catch (err) {
    return { installed: false, error: String(err) };
  }
}

function testFilePlayable(filePath: string): { playable: boolean; duration?: number; error?: string } {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}" 2>&1`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const duration = parseFloat(result.trim());
    if (!isNaN(duration) && duration > 0) {
      return { playable: true, duration };
    }
    return { playable: false, error: `Invalid duration: ${result}` };
  } catch (err) {
    return { playable: false, error: String(err) };
  }
}

export async function GET() {
  try {
    const debug: Record<string, unknown> = {
      cwd: process.cwd(),
      libraryFile: CLOUD_LIBRARY_FILE,
      libraryFileExists: fs.existsSync(CLOUD_LIBRARY_FILE),
      audioDir: AUDIO_DIR,
      audioDirExists: fs.existsSync(AUDIO_DIR),
    };

    // Check library file
    if (fs.existsSync(CLOUD_LIBRARY_FILE)) {
      const raw = fs.readFileSync(CLOUD_LIBRARY_FILE, 'utf-8');
      debug.libraryFileSize = raw.length;

      try {
        const data = JSON.parse(raw);
        debug.trackCount = data.tracks?.length || 0;

        // Sample first 3 tracks
        if (data.tracks && data.tracks.length > 0) {
          debug.sampleTracks = data.tracks.slice(0, 3).map((t: { filePath: string; fileName: string; title: string }) => ({
            filePath: t.filePath,
            fileName: t.fileName,
            title: t.title,
            fileExists: fs.existsSync(t.filePath),
          }));
        }

        // Count tracks with existing files
        let existingCount = 0;
        let missingCount = 0;
        const missingPaths: string[] = [];

        for (const track of data.tracks || []) {
          if (fs.existsSync(track.filePath)) {
            existingCount++;
          } else {
            missingCount++;
            if (missingPaths.length < 5) {
              missingPaths.push(track.filePath);
            }
          }
        }

        debug.existingFileCount = existingCount;
        debug.missingFileCount = missingCount;
        debug.sampleMissingPaths = missingPaths;
      } catch (parseErr) {
        debug.parseError = String(parseErr);
      }
    }

    // Check audio directory
    if (fs.existsSync(AUDIO_DIR)) {
      const files = fs.readdirSync(AUDIO_DIR);
      debug.audioDirFileCount = files.length;
      debug.sampleAudioFiles = files.slice(0, 5);
    }

    // Check ffprobe installation
    debug.ffprobe = checkFfprobe();

    // BPM distribution check
    if (fs.existsSync(CLOUD_LIBRARY_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(CLOUD_LIBRARY_FILE, 'utf-8'));
        const bpms = (data.tracks || []).map((t: { bpm: number }) => t.bpm).filter((b: number) => b > 0);
        if (bpms.length > 0) {
          const sorted = bpms.sort((a: number, b: number) => a - b);
          debug.bpmStats = {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: sorted[Math.floor(sorted.length / 2)],
            tracksInRange115_135: bpms.filter((b: number) => b >= 115 && b <= 135).length,
            tracksWithValidBpm: bpms.length,
          };
        }
      } catch { /* ignore */ }
    }

    // Test file playability on first 3 existing files
    if (fs.existsSync(CLOUD_LIBRARY_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(CLOUD_LIBRARY_FILE, 'utf-8'));
        const playabilityTests: Array<{ file: string; result: ReturnType<typeof testFilePlayable> }> = [];

        for (const track of (data.tracks || []).slice(0, 3)) {
          if (fs.existsSync(track.filePath)) {
            playabilityTests.push({
              file: track.fileName,
              result: testFilePlayable(track.filePath)
            });
          }
        }
        debug.playabilityTests = playabilityTests;
      } catch {
        // Already handled above
      }
    }

    return NextResponse.json(debug);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
