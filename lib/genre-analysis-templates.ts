/**
 * Genre-Specific Analysis Templates
 *
 * Each genre has different structural characteristics that affect:
 * - Segment detection (intro/verse/buildup/drop/breakdown/outro)
 * - Mix point selection (where to start/end crossfades)
 * - Energy curve expectations
 * - Phrase lengths (4/8/16/32-bar patterns)
 */

export interface GenreTemplate {
  name: string;
  aliases: string[]; // Alternative names for this genre

  // BPM characteristics
  bpmRange: { min: number; max: number };
  bpmTolerance: number; // ±BPM for mixing

  // Structural characteristics
  typicalLength: { min: number; max: number }; // seconds
  phraseLength: number; // bars (usually 4, 8, or 16)
  hasDrops: boolean; // Does this genre typically have drops?
  hasBreakdowns: boolean; // Does it have breakdowns?

  // Energy characteristics
  energyProfile: 'steady' | 'building' | 'peaks' | 'dynamic';
  dropIntensity: 'low' | 'medium' | 'high'; // How dramatic are drops?

  // Mixing recommendations
  idealCrossfadeBars: number;
  mixInPreference: 'intro' | 'verse' | 'breakdown'; // Best segment to mix in
  mixOutPreference: 'breakdown' | 'outro' | 'verse'; // Best segment to mix out

  // Segment detection parameters
  segmentWindowSize: number; // seconds (2-8)
  dropEnergyThreshold: number; // relative to average (e.g., 1.3 = 30% above avg)
  breakdownEnergyThreshold: number; // relative to average (e.g., 0.6 = 40% below avg)
}

export const GENRE_TEMPLATES: Record<string, GenreTemplate> = {
  house: {
    name: 'House',
    aliases: ['deep house', 'tech house', 'progressive house', 'future house'],
    bpmRange: { min: 120, max: 130 },
    bpmTolerance: 1.5,
    typicalLength: { min: 300, max: 480 }, // 5-8 minutes
    phraseLength: 16, // 16-bar phrases (4 phrases = 64 bars = ~2 min)
    hasDrops: true,
    hasBreakdowns: true,
    energyProfile: 'building',
    dropIntensity: 'medium',
    idealCrossfadeBars: 32, // Long blend (2+ minutes)
    mixInPreference: 'intro',
    mixOutPreference: 'breakdown',
    segmentWindowSize: 2, // 2-second windows for precise detection
    dropEnergyThreshold: 1.25,
    breakdownEnergyThreshold: 0.65,
  },

  techno: {
    name: 'Techno',
    aliases: ['minimal techno', 'peak time techno', 'industrial techno'],
    bpmRange: { min: 125, max: 135 },
    bpmTolerance: 1.5,
    typicalLength: { min: 360, max: 540 }, // 6-9 minutes
    phraseLength: 16, // 16-bar phrases
    hasDrops: true,
    hasBreakdowns: true,
    energyProfile: 'steady',
    dropIntensity: 'high',
    idealCrossfadeBars: 32, // Long blend
    mixInPreference: 'intro',
    mixOutPreference: 'breakdown',
    segmentWindowSize: 2,
    dropEnergyThreshold: 1.35,
    breakdownEnergyThreshold: 0.60,
  },

  trance: {
    name: 'Trance',
    aliases: ['progressive trance', 'uplifting trance', 'psytrance'],
    bpmRange: { min: 128, max: 145 },
    bpmTolerance: 2.0,
    typicalLength: { min: 420, max: 600 }, // 7-10 minutes
    phraseLength: 8, // 8-bar phrases
    hasDrops: true,
    hasBreakdowns: true,
    energyProfile: 'building',
    dropIntensity: 'high',
    idealCrossfadeBars: 32, // Long atmospheric blends
    mixInPreference: 'breakdown',
    mixOutPreference: 'breakdown',
    segmentWindowSize: 3, // Longer windows for atmospheric sections
    dropEnergyThreshold: 1.40,
    breakdownEnergyThreshold: 0.55,
  },

  'drum-and-bass': {
    name: 'Drum and Bass',
    aliases: ['dnb', 'd&b', 'jungle', 'liquid dnb'],
    bpmRange: { min: 160, max: 180 },
    bpmTolerance: 3.0,
    typicalLength: { min: 240, max: 360 }, // 4-6 minutes
    phraseLength: 8, // 8-bar phrases
    hasDrops: true,
    hasBreakdowns: true,
    energyProfile: 'peaks',
    dropIntensity: 'high',
    idealCrossfadeBars: 16, // Medium blend (fast tempo = ~20s)
    mixInPreference: 'breakdown',
    mixOutPreference: 'breakdown',
    segmentWindowSize: 2,
    dropEnergyThreshold: 1.35,
    breakdownEnergyThreshold: 0.60,
  },

  dubstep: {
    name: 'Dubstep',
    aliases: ['brostep', 'riddim', 'future bass'],
    bpmRange: { min: 135, max: 145 },
    bpmTolerance: 2.5,
    typicalLength: { min: 180, max: 300 }, // 3-5 minutes
    phraseLength: 8, // 8-bar phrases
    hasDrops: true,
    hasBreakdowns: true,
    energyProfile: 'peaks',
    dropIntensity: 'high',
    idealCrossfadeBars: 8, // Short blend (emphasize drops)
    mixInPreference: 'intro',
    mixOutPreference: 'breakdown',
    segmentWindowSize: 2,
    dropEnergyThreshold: 1.50, // Very high drops
    breakdownEnergyThreshold: 0.50,
  },

  'hip-hop': {
    name: 'Hip-Hop',
    aliases: ['rap', 'trap', 'hip hop'],
    bpmRange: { min: 60, max: 100 },
    bpmTolerance: 8.0,
    typicalLength: { min: 150, max: 240 }, // 2.5-4 minutes
    phraseLength: 4, // 4-bar phrases (16-bar verses)
    hasDrops: false,
    hasBreakdowns: false,
    energyProfile: 'steady',
    dropIntensity: 'low',
    idealCrossfadeBars: 8, // Quick transitions
    mixInPreference: 'verse',
    mixOutPreference: 'verse',
    segmentWindowSize: 4, // Longer windows (slower tempo)
    dropEnergyThreshold: 1.20,
    breakdownEnergyThreshold: 0.70,
  },

  pop: {
    name: 'Pop',
    aliases: ['pop music', 'dance pop', 'electropop'],
    bpmRange: { min: 100, max: 130 },
    bpmTolerance: 6.0,
    typicalLength: { min: 150, max: 240 }, // 2.5-4 minutes
    phraseLength: 8, // 8-bar phrases
    hasDrops: false,
    hasBreakdowns: false,
    energyProfile: 'dynamic',
    dropIntensity: 'medium',
    idealCrossfadeBars: 8, // Medium blend
    mixInPreference: 'intro',
    mixOutPreference: 'outro',
    segmentWindowSize: 3,
    dropEnergyThreshold: 1.25,
    breakdownEnergyThreshold: 0.65,
  },

  disco: {
    name: 'Disco',
    aliases: ['nu-disco', 'disco house', 'funk'],
    bpmRange: { min: 110, max: 130 },
    bpmTolerance: 3.0,
    typicalLength: { min: 240, max: 420 }, // 4-7 minutes
    phraseLength: 8, // 8-bar phrases
    hasDrops: false,
    hasBreakdowns: true,
    energyProfile: 'steady',
    dropIntensity: 'low',
    idealCrossfadeBars: 16, // Classic DJ blends
    mixInPreference: 'intro',
    mixOutPreference: 'breakdown',
    segmentWindowSize: 3,
    dropEnergyThreshold: 1.20,
    breakdownEnergyThreshold: 0.70,
  },

  indie: {
    name: 'Indie',
    aliases: ['indie rock', 'alternative', 'indie pop'],
    bpmRange: { min: 90, max: 140 },
    bpmTolerance: 5.0,
    typicalLength: { min: 180, max: 300 }, // 3-5 minutes
    phraseLength: 8, // 8-bar phrases
    hasDrops: false,
    hasBreakdowns: false,
    energyProfile: 'dynamic',
    dropIntensity: 'low',
    idealCrossfadeBars: 8, // Medium blend
    mixInPreference: 'intro',
    mixOutPreference: 'outro',
    segmentWindowSize: 4,
    dropEnergyThreshold: 1.20,
    breakdownEnergyThreshold: 0.70,
  },

  ambient: {
    name: 'Ambient',
    aliases: ['downtempo', 'chillout', 'lounge'],
    bpmRange: { min: 60, max: 90 },
    bpmTolerance: 8.0,
    typicalLength: { min: 240, max: 600 }, // 4-10 minutes
    phraseLength: 4, // 4-bar phrases (or free-form)
    hasDrops: false,
    hasBreakdowns: false,
    energyProfile: 'steady',
    dropIntensity: 'low',
    idealCrossfadeBars: 16, // Long atmospheric blends
    mixInPreference: 'intro',
    mixOutPreference: 'outro',
    segmentWindowSize: 6, // Long windows for slow evolution
    dropEnergyThreshold: 1.15,
    breakdownEnergyThreshold: 0.75,
  },
};

/**
 * Get genre template by name or alias
 */
export function getGenreTemplate(genre?: string): GenreTemplate | null {
  if (!genre) return null;

  const genreLower = genre.toLowerCase();

  // Check exact match
  if (GENRE_TEMPLATES[genreLower]) {
    return GENRE_TEMPLATES[genreLower];
  }

  // Check aliases
  for (const template of Object.values(GENRE_TEMPLATES)) {
    if (template.aliases.some((alias) => genreLower.includes(alias))) {
      return template;
    }
  }

  // Check partial match in template name
  for (const [key, template] of Object.entries(GENRE_TEMPLATES)) {
    if (genreLower.includes(key) || key.includes(genreLower)) {
      return template;
    }
  }

  return null;
}

/**
 * Get default template for unknown genres
 */
export function getDefaultTemplate(): GenreTemplate {
  return {
    name: 'Unknown',
    aliases: [],
    bpmRange: { min: 60, max: 180 },
    bpmTolerance: 3.0,
    typicalLength: { min: 120, max: 360 },
    phraseLength: 8,
    hasDrops: true,
    hasBreakdowns: true,
    energyProfile: 'dynamic',
    dropIntensity: 'medium',
    idealCrossfadeBars: 16,
    mixInPreference: 'intro',
    mixOutPreference: 'breakdown',
    segmentWindowSize: 3,
    dropEnergyThreshold: 1.25,
    breakdownEnergyThreshold: 0.65,
  };
}

/**
 * Apply genre template to segment detection parameters
 */
export function applyGenreTemplate(
  genre?: string
): {
  windowSize: number;
  dropThreshold: number;
  breakdownThreshold: number;
  phraseLength: number;
  crossfadeBars: number;
} {
  const template = getGenreTemplate(genre) || getDefaultTemplate();

  return {
    windowSize: template.segmentWindowSize,
    dropThreshold: template.dropEnergyThreshold,
    breakdownThreshold: template.breakdownEnergyThreshold,
    phraseLength: template.phraseLength,
    crossfadeBars: template.idealCrossfadeBars,
  };
}
