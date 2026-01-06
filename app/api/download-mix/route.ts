import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'output');

/**
 * GET /api/download-mix?file=<filename>
 *
 * Download a generated mix file.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('file');

  if (!filename) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  // Sanitize filename to prevent directory traversal
  const sanitized = path.basename(filename);
  const filePath = path.join(OUTPUT_DIR, sanitized);

  // Security: ensure the path is within OUTPUT_DIR
  if (!filePath.startsWith(OUTPUT_DIR)) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const stat = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);
    const chunks: Buffer[] = [];

    for await (const chunk of fileStream) {
      chunks.push(chunk as Buffer);
    }

    const buffer = Buffer.concat(chunks);

    // Determine content type based on extension
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === '.mp3'
        ? 'audio/mpeg'
        : ext === '.wav'
          ? 'audio/wav'
          : ext === '.flac'
            ? 'audio/flac'
            : 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${sanitized}"`,
        'Content-Length': stat.size.toString(),
      },
    });
  } catch (error) {
    console.error('Error reading mix file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

/**
 * HEAD /api/download-mix?file=<filename>
 *
 * Check if a mix file exists and get its metadata.
 */
export async function HEAD(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('file');

  if (!filename) {
    return new NextResponse(null, { status: 400 });
  }

  const sanitized = path.basename(filename);
  const filePath = path.join(OUTPUT_DIR, sanitized);

  if (!filePath.startsWith(OUTPUT_DIR) || !fs.existsSync(filePath)) {
    return new NextResponse(null, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'application/octet-stream';

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Last-Modified': stat.mtime.toUTCString(),
    },
  });
}
