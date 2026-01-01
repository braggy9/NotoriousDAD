import { NextRequest, NextResponse } from 'next/server';
import { parseMIKCSV, deduplicateMIKTracks, getMIKLibraryStats } from '@/lib/mik-csv-parser';
import { batchMatchTracks } from '@/lib/track-matcher';
import { promises as fs } from 'fs';
import path from 'path';

// Store matched tracks in a JSON file (temporary storage)
const STORAGE_PATH = path.join(process.cwd(), 'data', 'matched-tracks.json');

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('spotify_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read CSV content
    const csvContent = await file.text();

    // Parse MIK CSV
    const mikTracks = parseMIKCSV(csvContent);
    const uniqueTracks = deduplicateMIKTracks(mikTracks);

    // Get library stats
    const stats = getMIKLibraryStats(uniqueTracks);

    // For initial upload, match a sample (first 100 tracks)
    // Full library matching can be done in background
    const sampleSize = Math.min(100, uniqueTracks.length);
    const sampleTracks = uniqueTracks.slice(0, sampleSize);

    console.log(`Matching ${sampleSize} sample tracks to Spotify...`);

    const matchedTracks = await batchMatchTracks(sampleTracks, accessToken);

    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (e) {
      // Directory might already exist
    }

    // Store matched tracks
    await fs.writeFile(
      STORAGE_PATH,
      JSON.stringify({
        uploadedAt: new Date().toISOString(),
        totalMIKTracks: uniqueTracks.length,
        matchedCount: matchedTracks.length,
        stats,
        tracks: matchedTracks,
        // Store remaining unmatched MIK tracks for later processing
        unmatchedMIK: uniqueTracks.slice(sampleSize),
      }, null, 2)
    );

    return NextResponse.json({
      success: true,
      totalMIKTracks: uniqueTracks.length,
      matchedCount: matchedTracks.length,
      matchRate: Math.round((matchedTracks.length / sampleSize) * 100),
      stats,
      message: `Matched ${matchedTracks.length} of ${sampleSize} sample tracks. Full library processing available.`,
    });

  } catch (error) {
    console.error('Error uploading MIK data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload MIK data' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve stored matched tracks
export async function GET(request: NextRequest) {
  try {
    const data = await fs.readFile(STORAGE_PATH, 'utf-8');
    const matchedData = JSON.parse(data);

    return NextResponse.json(matchedData);
  } catch (error) {
    return NextResponse.json(
      { error: 'No MIK data uploaded yet' },
      { status: 404 }
    );
  }
}
