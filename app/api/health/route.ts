import { NextResponse } from 'next/server';

/**
 * Health check endpoint for iOS/macOS apps
 * Used by ServerDiscovery to verify server is reachable
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Notorious DAD Mix Generator',
    version: '2.2.0',
  });
}
