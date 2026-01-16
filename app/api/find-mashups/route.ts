import { NextRequest, NextResponse } from 'next/server';
import {
  findMashupPairs,
  findBestMashupPartner,
  generateMashupSets,
  type MashupableTrack
} from '@/lib/mashup-generator';
import fs from 'fs';
import path from 'path';

/**
 * Find Mashup Pairs API
 *
 * POST /api/find-mashups
 * Body: {
 *   tracks: MashupableTrack[] | "use-library",
 *   mode: "pairs" | "partner" | "sets",
 *   targetTrackId?: string, // For "partner" mode
 *   minCompatibilityScore?: number,
 *   maxBPMDifference?: number
 * }
 *
 * Examples:
 * 1. Find all mashup pairs in library:
 *    POST { mode: "pairs", tracks: "use-library" }
 *
 * 2. Find best mashup partner for a specific track:
 *    POST { mode: "partner", targetTrackId: "spotify:track:xyz", tracks: "use-library" }
 *
 * 3. Generate mashup sets for a custom track list:
 *    POST { mode: "sets", tracks: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tracks: tracksInput,
      mode = 'pairs',
      targetTrackId,
      minCompatibilityScore = 70,
      maxBPMDifference = 0.06
    } = body;

    // Load tracks
    let tracks: MashupableTrack[] = [];

    if (tracksInput === 'use-library') {
      // Load from enhanced track database
      const dbPath = path.join(process.cwd(), 'data', 'enhanced-track-database.json');

      if (!fs.existsSync(dbPath)) {
        return NextResponse.json(
          { error: 'Enhanced track database not found. Run npm run create-enhanced-db first.' },
          { status: 404 }
        );
      }

      const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      tracks = dbData.tracks
        .filter((t: any) => t.bpm && t.camelotKey && t.energy !== undefined)
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          artist: t.artist,
          bpm: t.bpm,
          camelotKey: t.camelotKey,
          energy: t.energy,
          acousticness: t.acousticness,
          instrumentalness: t.instrumentalness,
          speechiness: t.speechiness,
          danceability: t.danceability,
          valence: t.valence
        }));

      console.log(`📚 Loaded ${tracks.length} mashup-compatible tracks from library`);
    } else if (Array.isArray(tracksInput)) {
      tracks = tracksInput;
    } else {
      return NextResponse.json(
        { error: 'Invalid tracks input. Must be "use-library" or array of tracks.' },
        { status: 400 }
      );
    }

    // Process based on mode
    switch (mode) {
      case 'pairs': {
        const pairs = findMashupPairs(tracks, {
          minCompatibilityScore,
          maxBPMDifference
        });

        return NextResponse.json({
          mode: 'pairs',
          totalTracks: tracks.length,
          totalPairs: pairs.length,
          pairs: pairs.slice(0, 50), // Limit to top 50 for performance
          summary: {
            easyPairs: pairs.filter(p => p.compatibility.difficulty === 'easy').length,
            mediumPairs: pairs.filter(p => p.compatibility.difficulty === 'medium').length,
            hardPairs: pairs.filter(p => p.compatibility.difficulty === 'hard').length,
            avgCompatibility: pairs.reduce((sum, p) => sum + p.compatibility.overallScore, 0) / pairs.length
          }
        });
      }

      case 'partner': {
        if (!targetTrackId) {
          return NextResponse.json(
            { error: 'targetTrackId required for partner mode' },
            { status: 400 }
          );
        }

        const targetTrack = tracks.find(t => t.id === targetTrackId);
        if (!targetTrack) {
          return NextResponse.json(
            { error: 'Target track not found in library' },
            { status: 404 }
          );
        }

        const candidates = tracks.filter(t => t.id !== targetTrackId);
        const bestPartner = findBestMashupPartner(targetTrack, candidates, {
          minCompatibilityScore,
          maxBPMDifference
        });

        if (!bestPartner) {
          return NextResponse.json({
            mode: 'partner',
            targetTrack,
            bestPartner: null,
            message: 'No compatible mashup partner found with current criteria'
          });
        }

        return NextResponse.json({
          mode: 'partner',
          targetTrack,
          bestPartner
        });
      }

      case 'sets': {
        const sets = generateMashupSets(tracks, {
          minCompatibilityScore
        });

        return NextResponse.json({
          mode: 'sets',
          totalTracks: tracks.length,
          totalSets: sets.length,
          sets,
          summary: {
            tracksInSets: sets.reduce((sum, set) => sum + set.length * 2, 0), // Each pair has 2 tracks
            avgSetCompatibility: sets.reduce((sum, set) => {
              const setScore = set.reduce((s, pair) => s + pair.compatibility.overallScore, 0) / set.length;
              return sum + setScore;
            }, 0) / sets.length
          }
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid mode. Must be "pairs", "partner", or "sets".' },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('❌ Mashup generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate mashups',
        details: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/find-mashups?trackId=spotify:track:xyz
 * Quick lookup for a single track's best mashup partner
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const trackId = searchParams.get('trackId');

    if (!trackId) {
      return NextResponse.json(
        { error: 'trackId parameter required' },
        { status: 400 }
      );
    }

    // Load library
    const dbPath = path.join(process.cwd(), 'data', 'enhanced-track-database.json');
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json(
        { error: 'Enhanced track database not found' },
        { status: 404 }
      );
    }

    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const tracks = dbData.tracks
      .filter((t: any) => t.bpm && t.camelotKey && t.energy !== undefined)
      .map((t: any) => ({
        id: t.id,
        name: t.name,
        artist: t.artist,
        bpm: t.bpm,
        camelotKey: t.camelotKey,
        energy: t.energy,
        instrumentalness: t.instrumentalness
      }));

    const targetTrack = tracks.find((t: MashupableTrack) => t.id === trackId);
    if (!targetTrack) {
      return NextResponse.json(
        { error: 'Track not found in library' },
        { status: 404 }
      );
    }

    const candidates = tracks.filter((t: MashupableTrack) => t.id !== trackId);
    const bestPartner = findBestMashupPartner(targetTrack, candidates);

    return NextResponse.json({
      targetTrack,
      bestPartner
    });

  } catch (error: any) {
    console.error('❌ Mashup lookup error:', error);
    return NextResponse.json(
      {
        error: 'Failed to find mashup partner',
        details: error.message
      },
      { status: 500 }
    );
  }
}
