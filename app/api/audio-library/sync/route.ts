import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const ANALYSIS_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis.json');

interface SyncStatus {
  inProgress: boolean;
  totalFiles: number;
  processedFiles: number;
  lastSync: string | null;
  currentFile: string | null;
}

let syncStatus: SyncStatus = {
  inProgress: false,
  totalFiles: 0,
  processedFiles: 0,
  lastSync: null,
  currentFile: null,
};

/**
 * GET - Check sync status
 */
export async function GET() {
  try {
    // Load library stats
    let librarySize = 0;
    try {
      const data = await fs.readFile(ANALYSIS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      librarySize = parsed.tracks?.length || 0;
    } catch {
      // File doesn't exist yet
    }

    return NextResponse.json({
      success: true,
      status: syncStatus,
      librarySize,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

/**
 * POST - Get list of files that need syncing (client sends their file list)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientFiles: string[] = body.files || [];

    // Load existing library
    let existingFiles: string[] = [];
    try {
      const data = await fs.readFile(ANALYSIS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      existingFiles = (parsed.tracks || []).map((t: { fileName: string }) => t.fileName);
    } catch {
      // File doesn't exist yet
    }

    // Find files that need uploading
    const needsUpload = clientFiles.filter(f => !existingFiles.includes(f));

    // Find files that exist on server but not on client (orphaned)
    const orphaned = existingFiles.filter(f => !clientFiles.includes(f));

    return NextResponse.json({
      success: true,
      totalClientFiles: clientFiles.length,
      totalServerFiles: existingFiles.length,
      needsUpload: needsUpload.length,
      orphaned: orphaned.length,
      filesToUpload: needsUpload,
      orphanedFiles: orphaned,
    });
  } catch (error) {
    console.error('Sync check error:', error);
    return NextResponse.json(
      { error: 'Failed to check sync status' },
      { status: 500 }
    );
  }
}
