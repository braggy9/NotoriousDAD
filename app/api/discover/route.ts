import { NextRequest, NextResponse } from 'next/server';
import * as os from 'os';

/**
 * GET /api/discover
 *
 * Returns server info for iOS/macOS app discovery.
 * Apps can ping this endpoint to verify connectivity.
 */
export async function GET(request: NextRequest) {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const [name, nets] of Object.entries(interfaces)) {
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  return NextResponse.json({
    service: 'NotoriousDAD Mix Server',
    version: '1.0.0',
    status: 'online',
    addresses,
    port: 3000,
    timestamp: new Date().toISOString(),
  });
}
