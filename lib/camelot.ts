/**
 * Camelot Wheel — Harmonic mixing key compatibility system.
 *
 * The wheel has 24 positions: 1A–12A (minor) and 1B–12B (major).
 * Compatible mixes: same number, ±1 on wheel, or A↔B at same number.
 */

// Each entry lists compatible Camelot keys (same number, ±1, and A↔B cross)
const CAMELOT_WHEEL: Record<string, string[]> = {
  "1A":  ["12A", "1A", "2A", "1B"],
  "2A":  ["1A",  "2A", "3A", "2B"],
  "3A":  ["2A",  "3A", "4A", "3B"],
  "4A":  ["3A",  "4A", "5A", "4B"],
  "5A":  ["4A",  "5A", "6A", "5B"],
  "6A":  ["5A",  "6A", "7A", "6B"],
  "7A":  ["6A",  "7A", "8A", "7B"],
  "8A":  ["7A",  "8A", "9A", "8B"],
  "9A":  ["8A",  "9A", "10A", "9B"],
  "10A": ["9A",  "10A", "11A", "10B"],
  "11A": ["10A", "11A", "12A", "11B"],
  "12A": ["11A", "12A", "1A",  "12B"],
  "1B":  ["12B", "1B", "2B", "1A"],
  "2B":  ["1B",  "2B", "3B", "2A"],
  "3B":  ["2B",  "3B", "4B", "3A"],
  "4B":  ["3B",  "4B", "5B", "4A"],
  "5B":  ["4B",  "5B", "6B", "5A"],
  "6B":  ["5B",  "6B", "7B", "6A"],
  "7B":  ["6B",  "7B", "8B", "7A"],
  "8B":  ["7B",  "8B", "9B", "8A"],
  "9B":  ["8B",  "9B", "10B", "9A"],
  "10B": ["9B",  "10B", "11B", "10A"],
  "11B": ["10B", "11B", "12B", "11A"],
  "12B": ["11B", "12B", "1B",  "12A"],
};

/** Returns all harmonically compatible keys for a given Camelot key. */
export function getCompatibleKeys(key: string): string[] {
  return CAMELOT_WHEEL[key] ?? [];
}

/** Returns true if two Camelot keys are harmonically compatible. */
export function isHarmonicMatch(a: string, b: string): boolean {
  const compatible = CAMELOT_WHEEL[a];
  if (!compatible) return false;
  return compatible.includes(b);
}

/**
 * Integer distance between two keys on the Camelot wheel.
 * 0 = same key, 1 = compatible neighbor, 2+ = increasing clash.
 */
export function keyDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!CAMELOT_WHEEL[a] || !CAMELOT_WHEEL[b]) return 99;

  const numA = parseInt(a);
  const numB = parseInt(b);
  const letterA = a.slice(-1);
  const letterB = b.slice(-1);

  // Distance around the 12-position circle
  const circleDistance = Math.min(
    Math.abs(numA - numB),
    12 - Math.abs(numA - numB)
  );

  // Add 1 for A↔B cross (different mode)
  const modePenalty = letterA !== letterB ? 1 : 0;

  return circleDistance + modePenalty;
}

/**
 * Converts Spotify's pitch_class (0-11) and mode (0=minor, 1=major)
 * to Camelot notation.
 *
 * Spotify pitch classes: 0=C, 1=C#, 2=D, ..., 11=B
 */
export function parseSpotifyKey(pitchClass: number, mode: number): string {
  // Map pitch class to Camelot number
  // Minor (A) mapping: pitch → camelot number
  const minorMap: Record<number, number> = {
    0: 5,   // C  minor → 5A
    1: 12,  // C# minor → 12A
    2: 7,   // D  minor → 7A
    3: 2,   // Eb minor → 2A
    4: 9,   // E  minor → 9A
    5: 4,   // F  minor → 4A
    6: 11,  // F# minor → 11A
    7: 6,   // G  minor → 6A
    8: 1,   // Ab minor → 1A
    9: 8,   // A  minor → 8A
    10: 3,  // Bb minor → 3A
    11: 10, // B  minor → 10A
  };

  // Major (B) mapping: pitch → camelot number
  const majorMap: Record<number, number> = {
    0: 8,   // C  major → 8B
    1: 3,   // Db major → 3B
    2: 10,  // D  major → 10B
    3: 5,   // Eb major → 5B
    4: 12,  // E  major → 12B
    5: 7,   // F  major → 7B
    6: 2,   // F# major → 2B
    7: 9,   // G  major → 9B
    8: 4,   // Ab major → 4B
    9: 11,  // A  major → 11B
    10: 6,  // Bb major → 6B
    11: 1,  // B  major → 1B
  };

  if (mode === 1) {
    return `${majorMap[pitchClass]}B`;
  }
  return `${minorMap[pitchClass]}A`;
}
