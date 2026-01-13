import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const claudeMd = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf-8');

    return new NextResponse(claudeMd, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Documentation not found' }, { status: 404 });
  }
}
