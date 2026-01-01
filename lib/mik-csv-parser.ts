// Parse Mixed In Key CSV exports

import { MIKTrack } from './types';

export interface MIKCSVRow {
  playlistName: string;
  fileName: string;
  keyResult: string;
  bpm: number;
  energy: number;
}

// Parse MIK CSV format
export const parseMIKCSV = (csvContent: string): MIKTrack[] => {
  const lines = csvContent.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  // Skip header line
  const dataLines = lines.slice(1);

  const tracks: MIKTrack[] = [];

  for (const line of dataLines) {
    // Parse CSV (handle commas in quoted fields)
    const values = parseCSVLine(line);

    if (values.length < 5) {
      console.warn('Skipping invalid row:', line);
      continue;
    }

    const [playlistName, fileName, keyResult, bpmStr, energyStr] = values;

    // Parse numeric values
    const bpm = parseFloat(bpmStr);
    const energy = parseInt(energyStr);

    if (isNaN(bpm) || isNaN(energy)) {
      console.warn('Skipping row with invalid numbers:', line);
      continue;
    }

    // Extract track name (remove remix/edit info for better matching)
    const trackName = cleanTrackName(fileName);

    // Convert MIK energy (1-10) to 0-1 scale
    const normalizedEnergy = energy / 10;

    tracks.push({
      trackName,
      artist: '', // Will be filled in during Spotify matching
      key: camelotToKey(keyResult), // Convert to standard key notation
      camelotKey: keyResult,
      bpm,
      energy: normalizedEnergy,
      filePath: fileName, // Original filename
    });
  }

  return tracks;
};

// Parse a single CSV line (handle quoted fields with commas)
const parseCSVLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

// Clean track name for better matching
const cleanTrackName = (fileName: string): string => {
  // Remove file extension
  let name = fileName.replace(/\.(mp3|m4a|flac|wav|aiff)$/i, '');

  // Keep remix/edit info as it helps matching
  // But remove some common noise
  name = name.replace(/\[.*?\]/g, ''); // Remove bracketed info

  return name.trim();
};

// Convert Camelot notation to standard key notation
const camelotToKey = (camelot: string): string => {
  const camelotMap: Record<string, string> = {
    '1A': 'Ab minor', '1B': 'B major',
    '2A': 'Eb minor', '2B': 'F# major',
    '3A': 'Bb minor', '3B': 'Db major',
    '4A': 'F minor', '4B': 'Ab major',
    '5A': 'C minor', '5B': 'Eb major',
    '6A': 'G minor', '6B': 'Bb major',
    '7A': 'D minor', '7B': 'F major',
    '8A': 'A minor', '8B': 'C major',
    '9A': 'E minor', '9B': 'G major',
    '10A': 'B minor', '10B': 'D major',
    '11A': 'F# minor', '11B': 'A major',
    '12A': 'Db minor', '12B': 'E major',
  };

  return camelotMap[camelot] || camelot;
};

// Remove duplicates (same track name)
export const deduplicateMIKTracks = (tracks: MIKTrack[]): MIKTrack[] => {
  const seen = new Set<string>();
  const unique: MIKTrack[] = [];

  for (const track of tracks) {
    const key = `${track.trackName.toLowerCase()}-${track.camelotKey}-${track.bpm}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(track);
    }
  }

  return unique;
};

// Get statistics about the MIK library
export const getMIKLibraryStats = (tracks: MIKTrack[]) => {
  const totalTracks = tracks.length;
  const avgBPM = tracks.reduce((sum, t) => sum + t.bpm, 0) / totalTracks;
  const avgEnergy = tracks.reduce((sum, t) => sum + (t.energy || 0), 0) / totalTracks;

  const keyDistribution: Record<string, number> = {};
  for (const track of tracks) {
    keyDistribution[track.camelotKey] = (keyDistribution[track.camelotKey] || 0) + 1;
  }

  const bpmRanges = {
    slow: tracks.filter(t => t.bpm < 100).length,
    medium: tracks.filter(t => t.bpm >= 100 && t.bpm < 130).length,
    fast: tracks.filter(t => t.bpm >= 130).length,
  };

  return {
    totalTracks,
    avgBPM: Math.round(avgBPM * 100) / 100,
    avgEnergy: Math.round(avgEnergy * 100) / 100,
    keyDistribution,
    bpmRanges,
  };
};
