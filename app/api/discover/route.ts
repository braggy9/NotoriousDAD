import { NextResponse } from 'next/server';

/**
 * GET /api/discover
 *
 * Server discovery endpoint for native apps.
 * Returns service information for connection verification.
 */
export async function GET() {
  return NextResponse.json({
    service: 'NotoriousDAD Mix Generator',
    version: '2.2.0',
    features: {
      playlistGeneration: true,
      audioMixGeneration: true,
      spotifyIntegration: true,
      appleMusicMatching: true,
    },
    endpoints: {
      generatePlaylist: '/api/generate-playlist',
      generateMix: '/api/generate-mix',
      mixStatus: '/api/mix-status/[jobId]',
      listMixes: '/api/list-mixes',
    },
  });
}
