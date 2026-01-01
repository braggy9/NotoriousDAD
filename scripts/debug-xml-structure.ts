import { parseStringPromise } from 'xml2js';
import { readFileSync } from 'fs';

async function main() {
  const xmlContent = readFileSync('apple-music-library.xml', 'utf-8');
  const parsed = await parseStringPromise(xmlContent);

  console.log('Root structure:');
  console.log(JSON.stringify(Object.keys(parsed), null, 2));

  console.log('\nPlist structure:');
  console.log(JSON.stringify(Object.keys(parsed.plist), null, 2));

  console.log('\nFirst dict keys:');
  const rootDict = parsed.plist.dict[0];
  console.log(JSON.stringify(Object.keys(rootDict), null, 2));

  console.log('\nKeys in root dict:');
  console.log(rootDict.key.slice(0, 20));

  // Find Tracks index
  const tracksIndex = rootDict.key.indexOf('Tracks');
  console.log(`\nTracks found at index: ${tracksIndex}`);

  if (tracksIndex >= 0) {
    console.log('\nStructure of Tracks value:');
    const tracksValue = rootDict.dict[tracksIndex];
    console.log(JSON.stringify(Object.keys(tracksValue), null, 2));

    console.log('\nFirst few track IDs:');
    console.log(tracksValue.key.slice(0, 5));

    console.log('\nFirst track structure:');
    const firstTrack = tracksValue.dict[0];
    console.log(JSON.stringify(Object.keys(firstTrack), null, 2));
    console.log('\nFirst track keys:');
    console.log(firstTrack.key.slice(0, 20));
  }
}

main();
