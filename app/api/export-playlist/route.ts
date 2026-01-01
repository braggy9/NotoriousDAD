import { NextRequest, NextResponse } from 'next/server';
import { generateM3U8Playlist, generateDjayProJSON, generateCSVPlaylist, getPlaylistFilename } from '@/lib/djay-pro-export';

export async function POST(request: NextRequest) {
  try {
    const { tracks, playlistName, format, metadata } = await request.json();

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: 'No tracks provided' }, { status: 400 });
    }

    if (!playlistName) {
      return NextResponse.json({ error: 'Playlist name required' }, { status: 400 });
    }

    if (!format || !['m3u8', 'json', 'csv'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format. Must be m3u8, json, or csv' }, { status: 400 });
    }

    let content: string;
    let mimeType: string;

    switch (format) {
      case 'm3u8':
        content = generateM3U8Playlist(tracks, playlistName, metadata);
        mimeType = 'audio/x-mpegurl';
        break;
      case 'json':
        content = generateDjayProJSON(tracks, playlistName, metadata);
        mimeType = 'application/json';
        break;
      case 'csv':
        content = generateCSVPlaylist(tracks);
        mimeType = 'text/csv';
        break;
      default:
        return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    const filename = getPlaylistFilename(playlistName, format);

    return new NextResponse(content, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export playlist' },
      { status: 500 }
    );
  }
}
