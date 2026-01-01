// Camelot Wheel - Harmonic Mixing System
// Maps musical keys to Camelot notation for DJ mixing

export const CAMELOT_WHEEL: Record<string, string> = {
  // Minor keys (A)
  'Ab minor': '1A', 'Abm': '1A',
  'Eb minor': '2A', 'Ebm': '2A',
  'Bb minor': '3A', 'Bbm': '3A',
  'F minor': '4A', 'Fm': '4A',
  'C minor': '5A', 'Cm': '5A',
  'G minor': '6A', 'Gm': '6A',
  'D minor': '7A', 'Dm': '7A',
  'A minor': '8A', 'Am': '8A',
  'E minor': '9A', 'Em': '9A',
  'B minor': '10A', 'Bm': '10A',
  'F# minor': '11A', 'F#m': '11A', 'Gb minor': '11A', 'Gbm': '11A',
  'Db minor': '12A', 'Dbm': '12A', 'C# minor': '12A', 'C#m': '12A',

  // Major keys (B)
  'B major': '1B', 'B': '1B',
  'F# major': '2B', 'F#': '2B', 'Gb major': '2B', 'Gb': '2B',
  'Db major': '3B', 'Db': '3B', 'C# major': '3B', 'C#': '3B',
  'Ab major': '4B', 'Ab': '4B',
  'Eb major': '5B', 'Eb': '5B',
  'Bb major': '6B', 'Bb': '6B',
  'F major': '7B', 'F': '7B',
  'C major': '8B', 'C': '8B',
  'G major': '9B', 'G': '9B',
  'D major': '10B', 'D': '10B',
  'A major': '11B', 'A': '11B',
  'E major': '12B', 'E': '12B',
};

// Convert Spotify key notation to Camelot
export const spotifyToCamelot = (key: number, mode: number): string => {
  const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const keyName = keys[key];
  const modeName = mode === 1 ? 'major' : 'minor';
  return CAMELOT_WHEEL[`${keyName} ${modeName}`] || '0A';
};

// Check if two Camelot keys are compatible for mixing
export const areKeysCompatible = (key1: string, key2: string): boolean => {
  if (!key1 || !key2 || key1 === '0A' || key2 === '0A') return true; // Unknown keys = compatible

  const num1 = parseInt(key1);
  const num2 = parseInt(key2);
  const letter1 = key1.slice(-1);
  const letter2 = key2.slice(-1);

  // Same key
  if (key1 === key2) return true;

  // Same number, different letter (relative major/minor)
  if (num1 === num2 && letter1 !== letter2) return true;

  // Adjacent numbers, same letter (up/down 1)
  const nextNum = (num1 % 12) + 1;
  const prevNum = num1 === 1 ? 12 : num1 - 1;
  if ((num2 === nextNum || num2 === prevNum) && letter1 === letter2) return true;

  return false;
};

// Get compatible keys for a given Camelot key
export const getCompatibleKeys = (camelotKey: string): string[] => {
  if (!camelotKey || camelotKey === '0A') return [];

  const num = parseInt(camelotKey);
  const letter = camelotKey.slice(-1);
  const oppositeLetter = letter === 'A' ? 'B' : 'A';

  const nextNum = (num % 12) + 1;
  const prevNum = num === 1 ? 12 : num - 1;

  return [
    camelotKey, // Same key
    `${num}${oppositeLetter}`, // Relative major/minor
    `${nextNum}${letter}`, // +1
    `${prevNum}${letter}`, // -1
  ];
};

// Calculate BPM compatibility (within 6% or half/double time)
export const areBPMsCompatible = (bpm1: number, bpm2: number): boolean => {
  if (!bpm1 || !bpm2) return true; // Unknown BPM = compatible

  const ratio = Math.max(bpm1, bpm2) / Math.min(bpm1, bpm2);

  // Within 6%
  if (ratio <= 1.06) return true;

  // Half/double time (within 6% tolerance)
  if (Math.abs(ratio - 2.0) <= 0.12) return true;

  return false;
};

// Score a transition between two tracks (0-100)
export const scoreTransition = (
  track1: { camelotKey: string; bpm: number; energy?: number },
  track2: { camelotKey: string; bpm: number; energy?: number }
): number => {
  let score = 0;

  // Key compatibility (40 points)
  if (areKeysCompatible(track1.camelotKey, track2.camelotKey)) {
    if (track1.camelotKey === track2.camelotKey) {
      score += 40; // Perfect match
    } else {
      score += 30; // Compatible
    }
  }

  // BPM compatibility (40 points)
  if (areBPMsCompatible(track1.bpm, track2.bpm)) {
    const bpmDiff = Math.abs(track1.bpm - track2.bpm);
    if (bpmDiff < 3) {
      score += 40; // Very close
    } else if (bpmDiff < 6) {
      score += 35; // Close
    } else {
      score += 25; // Compatible range
    }
  }

  // Energy transition (20 points)
  if (track1.energy !== undefined && track2.energy !== undefined) {
    const energyDiff = Math.abs(track1.energy - track2.energy);
    if (energyDiff < 0.1) {
      score += 20; // Smooth
    } else if (energyDiff < 0.2) {
      score += 15; // Good
    } else if (energyDiff < 0.3) {
      score += 10; // Acceptable
    }
  }

  return score;
};
