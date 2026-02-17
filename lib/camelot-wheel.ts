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

// Harmonic compatibility result with detailed scoring
export interface HarmonicCompatibility {
  compatible: boolean;
  type: 'same' | 'relative' | 'adjacent' | 'energy_boost' | 'modal' | 'clash';
  score: number; // 0-100 scale
  description: string;
}

// Get parallel key (major ↔ minor with same root note)
export const getParallelKey = (camelotKey: string): string | null => {
  if (!camelotKey || camelotKey === '0A') return null;

  const num = parseInt(camelotKey);
  const letter = camelotKey.slice(-1);

  // Parallel keys: same root note, different mode
  // C minor (5A) → C major (8B)
  // E major (12B) → E minor (9A)
  const parallelMap: Record<string, string> = {
    // Minor (A) → Major (B) parallel
    '1A': '4B',  // Ab minor → Ab major
    '2A': '5B',  // Eb minor → Eb major
    '3A': '6B',  // Bb minor → Bb major
    '4A': '7B',  // F minor → F major
    '5A': '8B',  // C minor → C major
    '6A': '9B',  // G minor → G major
    '7A': '10B', // D minor → D major
    '8A': '11B', // A minor → A major
    '9A': '12B', // E minor → E major
    '10A': '1B', // B minor → B major
    '11A': '2B', // F# minor → F# major
    '12A': '3B', // Db minor → Db major
    // Major (B) → Minor (A) parallel
    '1B': '10A', // B major → B minor
    '2B': '11A', // F# major → F# minor
    '3B': '12A', // Db major → Db minor
    '4B': '1A',  // Ab major → Ab minor
    '5B': '2A',  // Eb major → Eb minor
    '6B': '3A',  // Bb major → Bb minor
    '7B': '4A',  // F major → F minor
    '8B': '5A',  // C major → C minor
    '9B': '6A',  // G major → G minor
    '10B': '7A', // D major → D minor
    '11B': '8A', // A major → A minor
    '12B': '9A', // E major → E minor
  };

  return parallelMap[camelotKey] || null;
};

// Check if two Camelot keys are compatible for mixing (enhanced version)
export const areKeysCompatible = (
  key1: string,
  key2: string,
  options: { allowEnergyBoost?: boolean; allowModal?: boolean } = {}
): HarmonicCompatibility => {
  const { allowEnergyBoost = true, allowModal = true } = options;

  // Unknown keys = compatible (neutral)
  if (!key1 || !key2 || key1 === '0A' || key2 === '0A') {
    return {
      compatible: true,
      type: 'same',
      score: 50,
      description: 'Unknown key (neutral compatibility)',
    };
  }

  const num1 = parseInt(key1);
  const num2 = parseInt(key2);
  const letter1 = key1.slice(-1);
  const letter2 = key2.slice(-1);

  // Same key (perfect match)
  if (key1 === key2) {
    return {
      compatible: true,
      type: 'same',
      score: 100,
      description: 'Perfect match (same key)',
    };
  }

  // Relative major/minor (same number, different letter)
  if (num1 === num2 && letter1 !== letter2) {
    return {
      compatible: true,
      type: 'relative',
      score: 90,
      description: 'Relative major/minor (smooth transition)',
    };
  }

  // Adjacent keys (±1 on wheel, same letter)
  const nextNum = (num1 % 12) + 1;
  const prevNum = num1 === 1 ? 12 : num1 - 1;
  if ((num2 === nextNum || num2 === prevNum) && letter1 === letter2) {
    return {
      compatible: true,
      type: 'adjacent',
      score: 80,
      description: 'Adjacent key (gradual shift)',
    };
  }

  // Energy boost (+7 on wheel, same letter) - NEW!
  if (allowEnergyBoost && letter1 === letter2) {
    const energyBoost = ((num1 + 6) % 12) + 1; // +7 positions (0-indexed +6, then +1)
    if (num2 === energyBoost) {
      return {
        compatible: true,
        type: 'energy_boost',
        score: 70,
        description: '+7 energy boost (dramatic lift)',
      };
    }
  }

  // Modal interchange (parallel major/minor) - NEW!
  if (allowModal) {
    const parallelKey = getParallelKey(key1);
    if (parallelKey === key2) {
      return {
        compatible: true,
        type: 'modal',
        score: 60,
        description: 'Modal interchange (bright/dark shift)',
      };
    }
  }

  // Incompatible (clash)
  return {
    compatible: false,
    type: 'clash',
    score: 0,
    description: 'Key clash (avoid transition)',
  };
};

// Legacy boolean version for backward compatibility
export const areKeysCompatibleSimple = (key1: string, key2: string): boolean => {
  const result = areKeysCompatible(key1, key2);
  return result.compatible;
};

// Get compatible keys for a given Camelot key (enhanced with energy boost & modal)
export const getCompatibleKeys = (
  camelotKey: string,
  options: { includeEnergyBoost?: boolean; includeModal?: boolean } = {}
): string[] => {
  const { includeEnergyBoost = true, includeModal = true } = options;

  if (!camelotKey || camelotKey === '0A') return [];

  const num = parseInt(camelotKey);
  const letter = camelotKey.slice(-1);
  const oppositeLetter = letter === 'A' ? 'B' : 'A';

  const nextNum = (num % 12) + 1;
  const prevNum = num === 1 ? 12 : num - 1;
  const energyBoostNum = ((num + 6) % 12) + 1; // +7 positions

  const keys = [
    camelotKey, // Same key (100 score)
    `${num}${oppositeLetter}`, // Relative major/minor (90 score)
    `${nextNum}${letter}`, // +1 (80 score)
    `${prevNum}${letter}`, // -1 (80 score)
  ];

  // Add energy boost key (+7)
  if (includeEnergyBoost) {
    keys.push(`${energyBoostNum}${letter}`); // Energy boost (70 score)
  }

  // Add modal interchange (parallel major/minor)
  if (includeModal) {
    const parallelKey = getParallelKey(camelotKey);
    if (parallelKey) {
      keys.push(parallelKey); // Modal (60 score)
    }
  }

  return keys;
};

// Genre-specific BPM tolerances (in BPM units, not percentage)
export const GENRE_BPM_TOLERANCES: Record<string, number> = {
  'house': 1.5,           // ±1.5 BPM max (tight mixing)
  'deep house': 1.5,
  'tech house': 1.5,
  'progressive house': 2.0,
  'techno': 1.5,          // ±1.5 BPM max (tight)
  'minimal techno': 1.5,
  'trance': 2.0,          // ±2 BPM (slightly looser)
  'psytrance': 2.0,
  'drum and bass': 3.0,   // ±3 BPM (fast tempo allows more)
  'dnb': 3.0,
  'dubstep': 2.5,         // ±2.5 BPM
  'hip-hop': 8.0,         // ±8 BPM (very flexible genre)
  'hip hop': 8.0,
  'rap': 8.0,
  'trap': 6.0,            // ±6 BPM
  'pop': 6.0,             // ±6 BPM (flexible)
  'indie': 5.0,           // ±5 BPM
  'rock': 5.0,            // ±5 BPM
  'alternative': 5.0,
  'disco': 3.0,           // ±3 BPM (classic disco mixing)
  'nu-disco': 3.0,
  'funk': 4.0,            // ±4 BPM
  'downtempo': 5.0,       // ±5 BPM (relaxed genre)
  'ambient': 8.0,         // ±8 BPM (very flexible)
  'electronica': 4.0,     // ±4 BPM (default electronic)
  'electronic': 4.0,
  'dance': 3.0,           // ±3 BPM (generic dance)
  'edm': 3.0,             // ±3 BPM (electronic dance music)
};

// Get BPM tolerance for a genre (defaults to 3.0 BPM if unknown)
export const getBPMTolerance = (genre?: string): number => {
  if (!genre) return 3.0; // Default tolerance

  const genreLower = genre.toLowerCase();

  // Check exact match first
  if (GENRE_BPM_TOLERANCES[genreLower]) {
    return GENRE_BPM_TOLERANCES[genreLower];
  }

  // Check partial matches (e.g., "deep house remix" contains "deep house")
  for (const [key, tolerance] of Object.entries(GENRE_BPM_TOLERANCES)) {
    if (genreLower.includes(key)) {
      return tolerance;
    }
  }

  return 3.0; // Default tolerance
};

// Calculate BPM compatibility (enhanced with genre-specific tolerances)
export const areBPMsCompatible = (
  bpm1: number,
  bpm2: number,
  genre?: string
): boolean => {
  if (!bpm1 || !bpm2) return true; // Unknown BPM = compatible

  const tolerance = getBPMTolerance(genre);
  const bpmDiff = Math.abs(bpm1 - bpm2);

  // Within genre-specific tolerance
  if (bpmDiff <= tolerance) return true;

  // Half/double time check (for tracks with very different tempos)
  const ratio = Math.max(bpm1, bpm2) / Math.min(bpm1, bpm2);

  // Half time (2:1 ratio, within tolerance)
  if (Math.abs(ratio - 2.0) <= 0.12) return true;

  // Double time is the same as half time from the other perspective

  return false;
};

// Enhanced transition scoring with detailed breakdown
export interface TransitionScore {
  total: number; // 0-100
  harmonic: number; // 0-40 points
  bpm: number; // 0-40 points
  energy: number; // 0-20 points
  harmonicType: string;
  description: string;
}

// Score a transition between two tracks (enhanced version with breakdown)
export const scoreTransition = (
  track1: { camelotKey: string; bpm: number; energy?: number; genre?: string },
  track2: { camelotKey: string; bpm: number; energy?: number; genre?: string }
): TransitionScore => {
  let harmonicScore = 0;
  let harmonicType = 'unknown';
  let bpmScore = 0;
  let energyScore = 0;

  // Key compatibility (40 points max)
  const harmonicCompat = areKeysCompatible(track1.camelotKey, track2.camelotKey);
  if (harmonicCompat.compatible) {
    // Scale harmonic score (0-100) to points (0-40)
    harmonicScore = Math.round((harmonicCompat.score / 100) * 40);
    harmonicType = harmonicCompat.type;
  }

  // BPM compatibility (40 points max) - genre-aware
  const genre = track1.genre || track2.genre; // Use either genre
  const tolerance = getBPMTolerance(genre);

  if (areBPMsCompatible(track1.bpm, track2.bpm, genre)) {
    const bpmDiff = Math.abs(track1.bpm - track2.bpm);
    const halfTolerance = tolerance / 2;

    if (bpmDiff <= halfTolerance) {
      bpmScore = 40; // Very close (within half tolerance)
    } else if (bpmDiff <= tolerance) {
      bpmScore = 35; // Close (within tolerance)
    } else if (bpmDiff <= tolerance * 1.5) {
      bpmScore = 30; // Acceptable (within 1.5× tolerance)
    } else {
      bpmScore = 25; // Compatible but noticeable
    }
  } else {
    // Incompatible BPM
    const ratio = Math.max(track1.bpm, track2.bpm) / Math.min(track1.bpm, track2.bpm);
    if (ratio < 1.15) {
      bpmScore = 15; // Stretching it (within 15%)
    } else {
      bpmScore = 0; // Too different
    }
  }

  // Energy transition (20 points max)
  if (track1.energy !== undefined && track2.energy !== undefined) {
    const energyDiff = Math.abs(track1.energy - track2.energy);
    if (energyDiff < 0.1) {
      energyScore = 20; // Smooth (within 10%)
    } else if (energyDiff < 0.2) {
      energyScore = 15; // Good (within 20%)
    } else if (energyDiff < 0.3) {
      energyScore = 10; // Acceptable (within 30%)
    } else {
      energyScore = 5; // Noticeable jump
    }
  } else {
    // No energy data = neutral score
    energyScore = 10;
  }

  const total = harmonicScore + bpmScore + energyScore;

  // Generate description
  let description = '';
  if (total >= 90) description = 'Perfect transition (seamless)';
  else if (total >= 75) description = 'Excellent transition (smooth)';
  else if (total >= 60) description = 'Good transition (natural)';
  else if (total >= 45) description = 'Acceptable transition (workable)';
  else if (total >= 30) description = 'Challenging transition (risky)';
  else description = 'Poor transition (avoid)';

  return {
    total,
    harmonic: harmonicScore,
    bpm: bpmScore,
    energy: energyScore,
    harmonicType,
    description,
  };
};

// Legacy simple scoring function (returns just the number)
export const scoreTransitionSimple = (
  track1: { camelotKey: string; bpm: number; energy?: number; genre?: string },
  track2: { camelotKey: string; bpm: number; energy?: number; genre?: string }
): number => {
  const score = scoreTransition(track1, track2);
  return score.total;
};
