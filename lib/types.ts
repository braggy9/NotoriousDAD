// Type definitions for DJ Mix Generator

export interface MIKTrack {
  // Core identifiers
  trackName: string;
  artist: string;
  album?: string;

  // Mixed In Key analysis
  key: string; // e.g., "C major", "Am"
  camelotKey: string; // e.g., "8B", "8A"
  bpm: number;
  energy?: number; // 0-1 scale
  colorCode?: string; // MIK color coding

  // File info
  filePath?: string;
  duration?: number; // seconds
}

export interface SpotifyTrackWithFeatures {
  // Basic info
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string };
  uri: string;
  popularity: number;
  duration_ms: number;

  // Audio features
  key?: number; // 0-11 (Spotify notation)
  mode?: number; // 0=minor, 1=major
  tempo?: number; // BPM
  energy?: number; // 0-1
  danceability?: number; // 0-1
  valence?: number; // 0-1 (happiness)
  acousticness?: number; // 0-1
  instrumentalness?: number; // 0-1
  liveness?: number; // 0-1
  loudness?: number; // dB
  speechiness?: number; // 0-1

  // Derived from Spotify or MIK
  camelotKey?: string;
  matchedMIK?: boolean; // True if matched to MIK data
  mikData?: MIKTrack; // Original MIK data if matched
}

export interface PlaylistTrack extends SpotifyTrackWithFeatures {
  position: number;
  transitionScore?: number; // Score to next track
}

export interface PlaylistGenerationRequest {
  prompt: string;
  useHarmonicMixing?: boolean;
  useBPMMatching?: boolean;
  energyCurve?: 'build' | 'decline' | 'wave' | 'steady';
  minTracks?: number;
  maxTracks?: number;
  targetBPM?: number;
  targetKey?: string;
}

export interface TrackMatchResult {
  spotifyTrack: SpotifyTrackWithFeatures;
  mikTrack?: MIKTrack;
  matchConfidence: number; // 0-1
  matchMethod: 'exact' | 'fuzzy' | 'isrc' | 'none';
}
