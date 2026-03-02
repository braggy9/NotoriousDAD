#!/usr/bin/env python3
"""
Beat Analysis + Energy Enrichment Pipeline
===========================================
Enriches audio-library-analysis.json with:
  - segments  (intro / verse / buildup / drop / breakdown / outro)
  - mixPoints (mixInPoint, mixOutPoint, dropPoint, breakdownPoint)
  - transitionHints (preferredInType, hasStrongDrop, hasCleanOutro, idealCrossfadeBars)
  - energy    (1-10 scale from RMS loudness, only updates tracks still at default 5)

Algorithm mirrors lib/beat-analyzer.ts for full consistency with the mix engine.
Uses FFmpeg at 200 Hz (vs TypeScript's 22050 Hz) — 40× smaller audio payload,
same quality for segment detection. Single FFmpeg decode per track.

Usage:
  python3 scripts/beat-analysis-pipeline.py
  python3 scripts/beat-analysis-pipeline.py --workers 2   # fewer workers = less RAM
  python3 scripts/beat-analysis-pipeline.py --limit 100   # test first 100
  python3 scripts/beat-analysis-pipeline.py --no-resume   # restart from scratch

Estimated time: ~1–2s per track × 13,000 targets ÷ 4 workers ≈ 1–2 hours
"""

import argparse
import json
import math
import multiprocessing
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from multiprocessing import Pool

import numpy as np

LIBRARY_FILE = '/var/www/notorious-dad/data/audio-library-analysis.json'
CHECKPOINT_FILE = '/var/www/notorious-dad/data/beat-analysis-checkpoint.json'
SAMPLE_RATE = 200    # Hz — enough for energy envelope, 40× faster than 22050 Hz
WINDOW_SECS = 2      # 2-second energy windows (matches TypeScript detectSegments)
CHECKPOINT_EVERY = 500  # Save library JSON every 500 tracks (~18s write, 26 times total)


def log(msg: str) -> None:
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', flush=True)


# ---------------------------------------------------------------------------
# Audio analysis — mirrors lib/beat-analyzer.ts
# ---------------------------------------------------------------------------

def extract_audio(file_path: str, sample_rate: int = SAMPLE_RATE):
    """
    Extract audio as f32le mono at sample_rate Hz via FFmpeg stdout.
    Returns (numpy float32 array, duration_seconds) or (None, 0) on error.
    No temp files — streams directly to Python.
    """
    try:
        proc = subprocess.run(
            [
                'ffmpeg', '-i', file_path,
                '-ac', '1',
                '-ar', str(sample_rate),
                '-f', 'f32le',
                '-',
                '-loglevel', 'error',
            ],
            capture_output=True,
            timeout=90,
        )
        if proc.returncode != 0 or len(proc.stdout) < 16:
            return None, 0
        audio = np.frombuffer(proc.stdout, dtype=np.float32)
        duration = len(audio) / sample_rate
        return audio, duration
    except Exception:
        return None, 0


def compute_energy_windows(audio: np.ndarray, sample_rate: int = SAMPLE_RATE,
                            window_secs: int = WINDOW_SECS) -> list:
    """
    Compute RMS energy in 2-second windows, normalised to 0–1.
    Returns list of {time, energy, delta} — matches TypeScript windowEnergies.
    """
    window_samples = int(sample_rate * window_secs)
    raw = []
    for i in range(0, len(audio) - window_samples // 4, window_samples):
        window = audio[i:i + window_samples]
        if len(window) < window_samples // 4:
            break
        rms = float(np.sqrt(np.mean(window ** 2)))
        raw.append({'time': round(i / sample_rate, 2), 'rms': rms})

    if not raw:
        return []

    max_rms = max(w['rms'] for w in raw) or 1.0
    result = []
    prev = 0.0
    for w in raw:
        norm = w['rms'] / max_rms
        result.append({'time': w['time'], 'energy': norm, 'delta': norm - prev})
        prev = norm
    return result


def detect_segments(windows: list, duration: float) -> list:
    """
    Classify energy windows into track segments.
    Exact Python port of detectSegments() in lib/beat-analyzer.ts.
    """
    if not windows or duration == 0:
        return []

    avg_e = sum(w['energy'] for w in windows) / len(windows)
    max_e = max(w['energy'] for w in windows)
    drop_threshold = max_e * 0.85

    # Detect drop candidates: high energy + significant upward spike
    drop_indices: set = set()
    for i in range(1, len(windows) - 1):
        w = windows[i]
        if w['energy'] >= drop_threshold and w['delta'] > avg_e * 0.15:
            drop_indices.add(i)

    segments = []
    for i, w in enumerate(windows):
        end_time = windows[i + 1]['time'] if i + 1 < len(windows) else duration
        rel_pos = w['time'] / duration
        rel_e = (w['energy'] / avg_e) if avg_e > 0 else 1.0

        if rel_pos < 0.1:
            seg_type = 'intro'
        elif rel_pos > 0.9:
            seg_type = 'outro'
        elif i in drop_indices:
            seg_type = 'drop'
        elif (i + 1) in drop_indices and w['delta'] > avg_e * 0.05:
            seg_type = 'buildup'
        elif (i - 1) in drop_indices and w['delta'] < -avg_e * 0.05:
            seg_type = 'breakdown'
        elif rel_e > 1.2:
            seg_type = 'drop'
        elif rel_e < 0.6:
            seg_type = 'breakdown'
        elif w['delta'] > avg_e * 0.1:
            seg_type = 'buildup'
        else:
            seg_type = 'verse'

        segments.append({
            'type': seg_type,
            'startTime': round(w['time'], 2),
            'endTime': round(end_time, 2),
            'avgEnergy': round(w['energy'], 4),
            'beatCount': 0,
        })

    return segments


def find_mix_points(segments: list, duration: float) -> dict:
    """
    Compute optimal mix in/out points from segments.
    Mirrors findMixPoints() in lib/beat-analyzer.ts.
    """
    mix_in = 0.0
    mix_out = duration * 0.85
    drop_time = None
    breakdown_time = None

    middle = [
        s for s in segments
        if s['startTime'] > duration * 0.15 and s['endTime'] < duration * 0.85
    ]

    # Best drop = highest energy drop in the middle of the track
    drops = sorted(
        [s for s in middle if s['type'] == 'drop'],
        key=lambda s: -s['avgEnergy']
    )
    if drops:
        drop_time = drops[0]['startTime']

    # First breakdown = good mix-out candidate
    breakdowns = [s for s in middle if s['type'] == 'breakdown']
    if breakdowns:
        breakdown_time = breakdowns[0]['startTime']
        mix_out = breakdown_time

    # Intro end → mix-in point
    intro = next((s for s in segments if s['type'] == 'intro'), None)
    if intro:
        mix_in = intro['endTime']

    # Outro start → mix-out (only if no breakdown found)
    outro = next((s for s in segments if s['type'] == 'outro'), None)
    if outro and breakdown_time is None:
        mix_out = outro['startTime']

    return {
        'mixInPoint': round(mix_in, 2),
        'mixOutPoint': round(min(mix_out, duration * 0.97), 2),
        'dropPoint': round(drop_time, 2) if drop_time is not None else None,
        'breakdownPoint': round(breakdown_time, 2) if breakdown_time is not None else None,
    }


def build_transition_hints(segments: list) -> dict:
    """Build transition hints from segment analysis."""
    has_strong_drop = any(
        s['type'] == 'drop' and s['avgEnergy'] > 0.75 for s in segments
    )
    has_clean_outro = any(s['type'] == 'outro' for s in segments)

    if has_clean_outro:
        crossfade_bars = 32
    elif has_strong_drop:
        crossfade_bars = 8
    else:
        crossfade_bars = 16

    return {
        'preferredInType': segments[0]['type'] if segments else 'unknown',
        'preferredOutType': segments[-1]['type'] if segments else 'unknown',
        'hasStrongDrop': has_strong_drop,
        'hasCleanOutro': has_clean_outro,
        'idealCrossfadeBars': crossfade_bars,
    }


def compute_energy_score(audio: np.ndarray) -> int:
    """
    Map overall RMS to energy score 1–10 (log scale).
    Consistent with key-energy-pipeline.py formula.
    Only used for tracks where energy == 5 (default/unknown).
    """
    if audio is None or len(audio) == 0:
        return 5
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms <= 0:
        return 5
    log_rms = math.log10(max(rms, 0.001))
    score = round((log_rms + 3.5) / 3.0 * 9 + 1)
    return max(1, min(10, score))


# ---------------------------------------------------------------------------
# Worker — runs in a subprocess
# ---------------------------------------------------------------------------

def analyze_track(args: tuple) -> tuple:
    """
    Multiprocessing worker: analyse a single track file.
    Returns (track_id, segments, mix_points, transition_hints, energy | None).
    Energy is None if the track already has a non-default energy value.
    """
    track_id, file_path, current_energy = args

    try:
        audio, duration = extract_audio(file_path)
        if audio is None or duration < 5:
            return track_id, None, None, None, None

        windows = compute_energy_windows(audio)
        if not windows:
            return track_id, None, None, None, None

        segments = detect_segments(windows, duration)
        mix_points = find_mix_points(segments, duration)
        hints = build_transition_hints(segments)

        # Recompute energy only for tracks still at default 5
        energy = compute_energy_score(audio) if current_energy == 5 else None

        return track_id, segments, mix_points, hints, energy

    except Exception as e:
        return track_id, None, None, None, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description='Beat Analysis + Energy Enrichment')
    parser.add_argument('--workers', type=int, default=4,
                        help='Parallel workers (default: 4)')
    parser.add_argument('--limit', type=int, default=0,
                        help='Process only N tracks (0 = all)')
    parser.add_argument('--resume', default=True, action='store_true',
                        help='Resume from checkpoint (default: on)')
    parser.add_argument('--no-resume', dest='resume', action='store_false',
                        help='Restart from scratch')
    args = parser.parse_args()

    log('Loading library...')
    with open(LIBRARY_FILE) as f:
        data = json.load(f)

    tracks = data.get('tracks', [])
    track_index = {t['id']: i for i, t in enumerate(tracks)}
    log(f'Total tracks: {len(tracks)}')

    # Load checkpoint
    processed_ids: set = set()
    if args.resume and os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE) as f:
            cp = json.load(f)
            processed_ids = set(cp.get('processed_ids', []))
        log(f'Resuming — {len(processed_ids)} already done')
    elif not args.resume:
        log('Starting fresh (--no-resume)')

    # Identify tracks needing analysis
    to_process = []
    for t in tracks:
        if t['id'] in processed_ids:
            continue
        already_enriched = bool(t.get('segments')) and len(t.get('segments', [])) > 0
        if already_enriched:
            continue
        fp = t.get('filePath', '')
        if fp and os.path.exists(fp):
            to_process.append((t['id'], fp, t.get('energy', 5)))

    if args.limit > 0:
        to_process = to_process[:args.limit]

    log(f'Tracks to process: {len(to_process)} | workers: {args.workers}')

    if not to_process:
        log('Nothing to do — all tracks already enriched.')
        return

    start_time = time.time()
    done = 0
    enriched = 0
    energy_updated = 0

    log(f'Starting analysis...')

    with Pool(processes=args.workers) as pool:
        for result in pool.imap_unordered(analyze_track, to_process, chunksize=1):
            track_id, segments, mix_points, hints, energy = result

            if segments:
                idx = track_index.get(track_id)
                if idx is not None:
                    tracks[idx]['segments'] = segments
                    tracks[idx]['mixPoints'] = mix_points
                    tracks[idx]['transitionHints'] = hints
                    tracks[idx]['analyzerVersion'] = 'v6-python-beat'
                    if energy is not None:
                        tracks[idx]['energy'] = energy
                        energy_updated += 1
                    enriched += 1

            processed_ids.add(track_id)
            done += 1

            # Progress line
            elapsed = time.time() - start_time
            rate = done / elapsed if elapsed > 0 else 0.001
            remaining_s = (len(to_process) - done) / rate
            eta = datetime.now() + timedelta(seconds=remaining_s)
            log(
                f'[{done}/{len(to_process)}] enriched={enriched} '
                f'energy_fixed={energy_updated} | '
                f'{rate:.1f}/s | ETA {eta.strftime("%H:%M")}'
            )

            # Fast checkpoint every 50 tracks (just IDs — tiny file)
            if done % 50 == 0:
                with open(CHECKPOINT_FILE, 'w') as f:
                    json.dump({'processed_ids': list(processed_ids),
                               'done': done, 'enriched': enriched}, f)

            # Full library save every 500 tracks (~18s for 313MB JSON)
            if done % CHECKPOINT_EVERY == 0:
                log('Saving library to disk...')
                data['tracks'] = tracks
                tmp = LIBRARY_FILE + '.tmp'
                with open(tmp, 'w') as f:
                    json.dump(data, f)
                os.replace(tmp, LIBRARY_FILE)
                log(f'Library saved ({done}/{len(to_process)} done).')

    # Final write
    log('Writing final library...')
    data['tracks'] = tracks
    tmp = LIBRARY_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f)
    os.replace(tmp, LIBRARY_FILE)

    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)

    elapsed = time.time() - start_time
    log(f'Complete! {done} processed, {enriched} enriched, '
        f'{energy_updated} energy scores updated ({elapsed / 60:.1f} min)')

    log('Restarting PM2 to reload library cache...')
    os.system('pm2 restart notorious-dad')
    log('Done. Library cache will reload on next request.')


if __name__ == '__main__':
    main()
