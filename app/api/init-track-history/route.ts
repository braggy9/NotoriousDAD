import { NextResponse } from 'next/server';
import { initTrackHistoryTable, cleanupOldTrackHistory } from '@/lib/track-history';

export async function GET() {
  try {
    console.log('🔧 Initializing track history table...');

    await initTrackHistoryTable();

    // Also run cleanup
    const cleaned = await cleanupOldTrackHistory();

    return NextResponse.json({
      success: true,
      message: 'Track history table initialized',
      cleanedEntries: cleaned,
    });
  } catch (error) {
    console.error('Failed to initialize track history:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
