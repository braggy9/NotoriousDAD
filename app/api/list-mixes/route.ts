import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const OUTPUT_DIR = path.join(process.cwd(), 'output');

interface MixInfo {
  filename: string;
  name: string;
  size: number;
  sizeFormatted: string;
  duration: number;
  durationFormatted: string;
  createdAt: string;
  downloadUrl: string;
}

/**
 * GET /api/list-mixes
 *
 * List all available generated mixes.
 */
export async function GET(request: NextRequest) {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return NextResponse.json({ mixes: [], total: 0 });
    }

    const files = fs.readdirSync(OUTPUT_DIR);
    const audioExtensions = ['.mp3', '.wav', '.flac', '.m4a'];

    const mixes: MixInfo[] = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!audioExtensions.includes(ext)) continue;

      const filePath = path.join(OUTPUT_DIR, file);
      const stat = fs.statSync(filePath);

      // Get duration using ffprobe
      let duration = 0;
      try {
        const result = execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
          { encoding: 'utf-8' }
        );
        duration = parseFloat(result.trim());
      } catch {
        // Fallback if ffprobe fails
        duration = 0;
      }

      mixes.push({
        filename: file,
        name: path.basename(file, ext).replace(/-/g, ' '),
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        duration,
        durationFormatted: formatDuration(duration),
        createdAt: stat.birthtime.toISOString(),
        downloadUrl: `/api/download-mix?file=${encodeURIComponent(file)}`,
      });
    }

    // Sort by creation date (newest first)
    mixes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      mixes,
      total: mixes.length,
      totalSize: formatBytes(mixes.reduce((sum, m) => sum + m.size, 0)),
      totalDuration: formatDuration(mixes.reduce((sum, m) => sum + m.duration, 0)),
    });
  } catch (error) {
    console.error('Error listing mixes:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list mixes' },
      { status: 500 }
    );
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
