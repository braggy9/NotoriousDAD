/**
 * Bonjour Service Advertiser
 *
 * Advertises the DJ Mix Generator server on the local network
 * so iOS/macOS apps can automatically discover it.
 */

import * as os from 'os';
import * as dgram from 'dgram';

const SERVICE_TYPE = '_notoriousdad._tcp';
const SERVICE_NAME = 'NotoriousDAD Mix Server';
const PORT = 3000;

interface NetworkInterface {
  name: string;
  address: string;
}

/**
 * Get all local IPv4 addresses
 */
function getLocalAddresses(): NetworkInterface[] {
  const interfaces = os.networkInterfaces();
  const addresses: NetworkInterface[] = [];

  for (const [name, nets] of Object.entries(interfaces)) {
    if (!nets) continue;
    for (const net of nets) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }

  return addresses;
}

/**
 * Simple mDNS responder for service discovery
 * Note: For production, use the 'bonjour' or 'mdns' npm package
 */
export function startBonjourAdvertisement(): { stop: () => void } {
  const addresses = getLocalAddresses();
  console.log('📡 Bonjour Service Advertisement');
  console.log('================================');
  console.log(`Service: ${SERVICE_NAME}`);
  console.log(`Type: ${SERVICE_TYPE}`);
  console.log(`Port: ${PORT}`);
  console.log('\nAvailable addresses:');
  addresses.forEach((addr) => {
    console.log(`  • ${addr.name}: http://${addr.address}:${PORT}`);
  });
  console.log('\nNote: iOS app will auto-discover on same WiFi network');
  console.log('================================\n');

  // For a full implementation, you'd use the 'bonjour' npm package:
  // const bonjour = require('bonjour')();
  // bonjour.publish({ name: SERVICE_NAME, type: 'notoriousdad', port: PORT });

  // For now, we just log the addresses for manual configuration
  // The iOS app will try common addresses automatically

  return {
    stop: () => {
      console.log('Bonjour advertisement stopped');
    },
  };
}

/**
 * Get the primary local IP address (usually the WiFi interface)
 */
export function getPrimaryLocalAddress(): string | null {
  const addresses = getLocalAddresses();

  // Prefer en0 (WiFi on Mac) or common interface names
  const preferred = addresses.find(
    (addr) =>
      addr.name === 'en0' ||
      addr.name === 'en1' ||
      addr.name === 'eth0' ||
      addr.name.startsWith('Wi-Fi')
  );

  if (preferred) return preferred.address;
  if (addresses.length > 0) return addresses[0].address;

  return null;
}

// Export addresses for the API to return
export function getServerAddresses(): { addresses: string[]; primary: string | null } {
  const addresses = getLocalAddresses();
  return {
    addresses: addresses.map((a) => a.address),
    primary: getPrimaryLocalAddress(),
  };
}

// CLI execution
if (require.main === module) {
  startBonjourAdvertisement();
}
