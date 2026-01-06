/**
 * Genre Compatibility System
 *
 * Groups genres into families and determines compatibility.
 * Used to filter out tracks that are obviously wrong genre for a mix.
 */

// Genre families - genres in the same family mix well together
export const GENRE_FAMILIES: Record<string, string[]> = {
  // Electronic / Dance
  'electronic': [
    'electronic', 'electronica', 'electro', 'dance', 'edm',
    'house', 'deep house', 'tech house', 'progressive house', 'melodic house',
    'techno', 'minimal techno', 'acid techno',
    'trance', 'progressive trance', 'psytrance',
    'drum and bass', 'dnb', 'd&b', 'jungle',
    'dubstep', 'future bass', 'bass music',
    'ambient', 'downtempo', 'chillout', 'chill', 'lounge',
    'trip-hop', 'trip hop', 'triphop',
    'uk garage', 'garage', '2-step',
    'big beat', 'breakbeat', 'breaks',
    'idm', 'experimental electronic',
    'synthwave', 'retrowave', 'outrun',
  ],

  // Hip-hop / R&B / Soul
  'hiphop-soul': [
    'hip hop', 'hip-hop', 'hiphop', 'rap',
    'r&b', 'rnb', 'rhythm and blues',
    'soul', 'neo soul', 'neo-soul',
    'funk', 'g-funk',
    'jazz rap', 'jazz-rap', 'conscious hip hop',
    'boom bap', 'lo-fi hip hop', 'lofi',
    'trap', 'southern hip hop',
  ],

  // Rock / Alternative
  'rock': [
    'rock', 'alternative', 'alt rock', 'alternative rock',
    'indie rock', 'indie', 'indie pop',
    'classic rock', 'hard rock', 'soft rock',
    'punk', 'punk rock', 'post-punk',
    'grunge', 'metal', 'heavy metal',
    'progressive rock', 'prog rock',
    'psychedelic rock', 'psych rock',
    'blues rock', 'garage rock',
  ],

  // Pop
  'pop': [
    'pop', 'dance pop', 'synth pop', 'synthpop',
    'electropop', 'indie pop', 'art pop',
    'dream pop', 'chamber pop',
    'k-pop', 'j-pop',
    'teen pop', 'bubblegum pop',
  ],

  // Country / Folk / Americana
  'country-folk': [
    'country', 'country rock', 'alt country',
    'folk', 'folk rock', 'americana',
    'bluegrass', 'country pop',
    'singer-songwriter',
  ],

  // Classical / Jazz
  'classical-jazz': [
    'classical', 'orchestral', 'symphony',
    'jazz', 'smooth jazz', 'jazz fusion',
    'bebop', 'swing', 'big band',
    'latin jazz', 'bossa nova',
  ],

  // Reggae / Caribbean
  'reggae-caribbean': [
    'reggae', 'dub', 'dancehall',
    'reggaeton', 'latin',
    'ska', 'rocksteady',
  ],

  // 70s/80s Pop (ABBA, Disco era)
  'retro-pop': [
    'disco', 'euro disco', 'italo disco',
    '70s', '80s', 'new wave',
    'glam rock', 'arena rock',
    'adult contemporary', 'soft rock',
  ],
};

// Map individual genres to their family
const genreToFamily = new Map<string, string>();
for (const [family, genres] of Object.entries(GENRE_FAMILIES)) {
  for (const genre of genres) {
    genreToFamily.set(genre.toLowerCase(), family);
  }
}

/**
 * Get the genre family for a given genre string
 */
export function getGenreFamily(genre: string): string | null {
  const normalized = genre.toLowerCase().trim();

  // Direct match
  if (genreToFamily.has(normalized)) {
    return genreToFamily.get(normalized)!;
  }

  // Partial match (e.g., "deep tech house" -> "electronic")
  for (const [g, family] of genreToFamily.entries()) {
    if (normalized.includes(g) || g.includes(normalized)) {
      return family;
    }
  }

  return null;
}

/**
 * Check if two genre families are compatible for mixing
 */
export function areGenreFamiliesCompatible(family1: string, family2: string): boolean {
  if (family1 === family2) return true;

  // Define compatible pairs
  const compatiblePairs: [string, string][] = [
    ['electronic', 'hiphop-soul'], // Electronic + Hip-hop mix well
    ['electronic', 'pop'], // Electronic + Pop mix well
    ['hiphop-soul', 'pop'], // Hip-hop + Pop mix well
    ['rock', 'pop'], // Rock + Pop can work
  ];

  return compatiblePairs.some(([a, b]) =>
    (family1 === a && family2 === b) || (family1 === b && family2 === a)
  );
}

/**
 * Detect genre family from artist name (known artists only)
 */
export const ARTIST_GENRE_MAP: Record<string, string> = {
  // Electronic / Downtempo
  'nightmares on wax': 'electronic',
  'bonobo': 'electronic',
  'caribou': 'electronic',
  'four tet': 'electronic',
  'tycho': 'electronic',
  'boards of canada': 'electronic',
  'massive attack': 'electronic',
  'portishead': 'electronic',
  'thievery corporation': 'electronic',
  'air': 'electronic',
  'zero 7': 'electronic',
  'royksopp': 'electronic',
  'morcheeba': 'electronic',
  'groove armada': 'electronic',
  'kruder & dorfmeister': 'electronic',
  'gotan project': 'electronic',
  'fred again': 'electronic',
  'disclosure': 'electronic',
  'rufus du sol': 'electronic',
  'chemical brothers': 'electronic',
  'fatboy slim': 'electronic',
  'daft punk': 'electronic',
  'justice': 'electronic',
  'deadmau5': 'electronic',
  'eric prydz': 'electronic',
  'lane 8': 'electronic',
  'ben bohmer': 'electronic',
  'nora en pure': 'electronic',
  'kygo': 'electronic',
  'odesza': 'electronic',
  'flume': 'electronic',
  'jamie xx': 'electronic',
  'kaytranada': 'electronic',
  'bicep': 'electronic',
  'floating points': 'electronic',

  // Hip-hop / Soul
  'jazzy jeff': 'hiphop-soul',
  'dj jazzy jeff': 'hiphop-soul',
  'a tribe called quest': 'hiphop-soul',
  'de la soul': 'hiphop-soul',
  'the roots': 'hiphop-soul',
  'j dilla': 'hiphop-soul',
  'madlib': 'hiphop-soul',
  'nujabes': 'hiphop-soul',
  'anderson .paak': 'hiphop-soul',
  'd\'angelo': 'hiphop-soul',
  'erykah badu': 'hiphop-soul',
  'lauryn hill': 'hiphop-soul',
  'common': 'hiphop-soul',
  'mos def': 'hiphop-soul',
  'talib kweli': 'hiphop-soul',
  'kendrick lamar': 'hiphop-soul',
  'frank ocean': 'hiphop-soul',
  'tyler, the creator': 'hiphop-soul',
  'slum village': 'hiphop-soul',

  // Country (INCOMPATIBLE with electronic)
  'luke combs': 'country-folk',
  'morgan wallen': 'country-folk',
  'chris stapleton': 'country-folk',
  'zach bryan': 'country-folk',
  'kane brown': 'country-folk',
  'luke bryan': 'country-folk',
  'carrie underwood': 'country-folk',
  'blake shelton': 'country-folk',
  'kenny chesney': 'country-folk',
  'tim mcgraw': 'country-folk',
  'dolly parton': 'country-folk',
  'johnny cash': 'country-folk',
  'willie nelson': 'country-folk',

  // 70s/80s Pop (INCOMPATIBLE with downtempo electronic)
  'abba': 'retro-pop',
  'bee gees': 'retro-pop',
  'earth, wind & fire': 'retro-pop',
  'donna summer': 'retro-pop',
  'chic': 'retro-pop',
  'gloria gaynor': 'retro-pop',
  'village people': 'retro-pop',
  'kool & the gang': 'retro-pop',

  // Classic Rock (often INCOMPATIBLE)
  'rem': 'rock',
  'r.e.m.': 'rock',
  'u2': 'rock',
  'coldplay': 'rock',
  'radiohead': 'rock',
  'pink floyd': 'rock',
  'led zeppelin': 'rock',
  'the beatles': 'rock',
  'queen': 'rock',
  'ac/dc': 'rock',

  // Classic Soul (can work with downtempo in some cases)
  'ben e. king': 'classical-jazz',
  'marvin gaye': 'classical-jazz',
  'stevie wonder': 'hiphop-soul', // More compatible
  'aretha franklin': 'classical-jazz',
  'otis redding': 'classical-jazz',

  // More Country (INCOMPATIBLE with electronic)
  'big & rich': 'country-folk',
  'leann rimes': 'country-folk',
  'shania twain': 'country-folk',
  'garth brooks': 'country-folk',
  'alan jackson': 'country-folk',
  'george strait': 'country-folk',
  'reba mcentire': 'country-folk',
  'toby keith': 'country-folk',
  'jason aldean': 'country-folk',
  'thomas rhett': 'country-folk',
  'sam hunt': 'country-folk',
  'florida georgia line': 'country-folk',
  'dan + shay': 'country-folk',
  'noah kahan': 'country-folk', // Folk-adjacent

  // Metal / Hard Rock (INCOMPATIBLE)
  'danzig': 'rock',
  'metallica': 'rock',
  'slayer': 'rock',
  'pantera': 'rock',
  'megadeth': 'rock',
  'iron maiden': 'rock',
  'black sabbath': 'rock',
  'judas priest': 'rock',
  'motley crue': 'rock',
  'def leppard': 'rock',
  'guns n\' roses': 'rock',
  'aerosmith': 'rock',
  'van halen': 'rock',
  'kiss': 'rock',
  'nirvana': 'rock',
  'pearl jam': 'rock',
  'soundgarden': 'rock',
  'alice in chains': 'rock',
  'foo fighters': 'rock',
  'green day': 'rock',
  'blink-182': 'rock',

  // More 70s/80s Pop
  'carly simon': 'retro-pop',
  'carole king': 'retro-pop',
  'fleetwood mac': 'retro-pop',
  'eagles': 'retro-pop',
  'elton john': 'retro-pop',
  'billy joel': 'retro-pop',
  'phil collins': 'retro-pop',
  'genesis': 'retro-pop',
  'hall & oates': 'retro-pop',
  'chicago': 'retro-pop',

  // More mainstream pop (often INCOMPATIBLE with downtempo)
  'lizzo': 'pop',
  'charlie puth': 'pop',
  'ed sheeran': 'pop',
  'shawn mendes': 'pop',
  'camila cabello': 'pop',
  'demi lovato': 'pop',
  'nick jonas': 'pop',
  'jonas brothers': 'pop',
  'harry styles': 'pop',
  'billie eilish': 'pop', // Actually more electronic-adjacent
  'olivia rodrigo': 'pop',
  'lorde': 'pop',

  // Aggressive Hip-hop (different from chill hip-hop)
  'juvenile': 'hiphop-soul',
  'dmx': 'hiphop-soul',
  'eminem': 'hiphop-soul',
  '50 cent': 'hiphop-soul',
  'nwa': 'hiphop-soul',
  'ice cube': 'hiphop-soul',
  'dr. dre': 'hiphop-soul',
  'snoop dogg': 'hiphop-soul',

  // Electronic-adjacent artists (COMPATIBLE)
  'sault': 'electronic', // Actually compatible - soulful electronic
  'khruangbin': 'electronic', // Psychedelic - compatible
  'tame impala': 'electronic',
  'moderat': 'electronic',
  'apparat': 'electronic',
  'jon hopkins': 'electronic',
  'amon tobin': 'electronic',
  'burial': 'electronic',
  'james blake': 'electronic',
  'mount kimbie': 'electronic',
  'sbtrkt': 'electronic',
  'kavinsky': 'electronic',
  'chromeo': 'electronic',

  // Pop (mixed compatibility)
  'taylor swift': 'pop',
  'ariana grande': 'pop',
  'dua lipa': 'electronic', // Electronic-pop crossover
  'sza': 'hiphop-soul',
  'the weeknd': 'hiphop-soul',
  'beyonce': 'hiphop-soul',
  'rihanna': 'hiphop-soul',
  'justin timberlake': 'hiphop-soul',
  'bruno mars': 'hiphop-soul',

  // Mainstream Pop (often INCOMPATIBLE with downtempo)
  'selena gomez': 'pop',
  'marshmello': 'electronic', // EDM, different vibe
  'p!nk': 'pop',
  'pink': 'pop',
  'katy perry': 'pop',
  'lady gaga': 'pop',
  'miley cyrus': 'pop',

  // Hip-hop (trap/modern - different from jazzy hip-hop)
  '2pac': 'hiphop-soul',
  'tupac': 'hiphop-soul',
  'sean paul': 'reggae-caribbean', // Dancehall

  // Indie / Alternative (mixed compatibility)
  'tash sultana': 'rock',
  'imogen heap': 'electronic', // Actually electronic-adjacent
  'djo': 'rock',
};

/**
 * Get genre family for an artist
 */
export function getArtistGenreFamily(artistName: string): string | null {
  const normalized = artistName.toLowerCase().trim();
  return ARTIST_GENRE_MAP[normalized] || null;
}

/**
 * Check if a track's artist genre is compatible with target genres
 * Returns compatibility status and whether artist was found in database
 */
export function isTrackGenreCompatible(
  trackArtists: { name: string }[],
  targetGenreFamilies: string[]
): { compatible: boolean; artistFamily?: string; reason?: string; unknownArtist?: boolean } {
  // If no target genres, everything is compatible
  if (targetGenreFamilies.length === 0) {
    return { compatible: true };
  }

  let foundKnownArtist = false;

  for (const artist of trackArtists) {
    if (!artist?.name) continue;

    const artistFamily = getArtistGenreFamily(artist.name);
    if (!artistFamily) continue; // Unknown artist - check others first

    foundKnownArtist = true;

    // Check if artist's family is compatible with ANY target family
    const isCompatible = targetGenreFamilies.some(targetFamily =>
      areGenreFamiliesCompatible(artistFamily, targetFamily)
    );

    if (!isCompatible) {
      return {
        compatible: false,
        artistFamily,
        reason: `${artist.name} is ${artistFamily}, incompatible with ${targetGenreFamilies.join('/')}`
      };
    }
  }

  // If we found a known artist and they're compatible, good
  if (foundKnownArtist) {
    return { compatible: true };
  }

  // Unknown artist - mark as such so caller can apply penalty
  return { compatible: true, unknownArtist: true };
}

/**
 * Determine target genre families from constraints
 */
export function getTargetGenreFamilies(constraints: {
  genres?: string[];
  referenceArtists?: string[];
  artists?: string[];
}): string[] {
  const families = new Set<string>();

  // From explicit genres
  if (constraints.genres) {
    for (const genre of constraints.genres) {
      const family = getGenreFamily(genre);
      if (family) families.add(family);
    }
  }

  // From reference artists
  if (constraints.referenceArtists) {
    for (const artist of constraints.referenceArtists) {
      const family = getArtistGenreFamily(artist);
      if (family) families.add(family);
    }
  }

  // From include artists
  if (constraints.artists) {
    for (const artist of constraints.artists) {
      const family = getArtistGenreFamily(artist);
      if (family) families.add(family);
    }
  }

  return Array.from(families);
}
