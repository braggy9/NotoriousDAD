/**
 * Mix Job Manager - Background job processing for mix generation
 *
 * This module handles async mix generation to avoid Cloudflare timeouts.
 * Jobs are stored as JSON files and processed in the background.
 */

import * as fs from 'fs';
import * as path from 'path';

const JOBS_DIR = path.join(process.cwd(), 'data', 'mix-jobs');

export interface MixJobStatus {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  prompt: string;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
  progress: number;
  progressMessage?: string;
  result?: {
    mixName: string;
    mixUrl: string;
    tracklist: Array<{
      position: number;
      artist: string;
      title: string;
      bpm?: number;
      key?: string;
    }>;
    duration: number;
    transitionCount: number;
    harmonicPercentage: number;
  };
  error?: string;
}

/**
 * Ensure jobs directory exists
 */
function ensureJobsDir(): void {
  if (!fs.existsSync(JOBS_DIR)) {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
  }
}

/**
 * Generate a unique job ID
 */
export function generateJobId(): string {
  return `mix-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get job file path
 */
function getJobPath(jobId: string): string {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

/**
 * Create a new mix job
 */
export function createJob(prompt: string, trackCount: number): MixJobStatus {
  ensureJobsDir();

  const job: MixJobStatus = {
    id: generateJobId(),
    status: 'pending',
    prompt,
    trackCount,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 0,
    progressMessage: 'Job created, waiting to start...',
  };

  fs.writeFileSync(getJobPath(job.id), JSON.stringify(job, null, 2));
  return job;
}

/**
 * Get job status
 */
export function getJob(jobId: string): MixJobStatus | null {
  const jobPath = getJobPath(jobId);
  if (!fs.existsSync(jobPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(jobPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Update job status
 */
export function updateJob(jobId: string, updates: Partial<MixJobStatus>): void {
  const job = getJob(jobId);
  if (!job) return;

  const updatedJob = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(getJobPath(jobId), JSON.stringify(updatedJob, null, 2));
}

/**
 * Mark job as complete
 */
export function completeJob(jobId: string, result: MixJobStatus['result']): void {
  updateJob(jobId, {
    status: 'complete',
    progress: 100,
    progressMessage: 'Mix complete!',
    result,
  });
}

/**
 * Mark job as failed
 */
export function failJob(jobId: string, error: string): void {
  updateJob(jobId, {
    status: 'failed',
    progressMessage: `Error: ${error}`,
    error,
  });
}

/**
 * List recent jobs (for debugging)
 */
export function listRecentJobs(limit: number = 10): MixJobStatus[] {
  ensureJobsDir();

  const files = fs.readdirSync(JOBS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      file: f,
      mtime: fs.statSync(path.join(JOBS_DIR, f)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    .slice(0, limit);

  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f.file), 'utf-8'));
    } catch {
      return null;
    }
  }).filter(Boolean) as MixJobStatus[];
}

/**
 * Clean up old completed/failed jobs (older than 24 hours)
 */
export function cleanupOldJobs(): number {
  ensureJobsDir();

  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  let cleaned = 0;

  const files = fs.readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const jobPath = path.join(JOBS_DIR, file);
    try {
      const job = JSON.parse(fs.readFileSync(jobPath, 'utf-8')) as MixJobStatus;
      const updatedAt = new Date(job.updatedAt).getTime();

      if (updatedAt < cutoff && (job.status === 'complete' || job.status === 'failed')) {
        fs.unlinkSync(jobPath);
        cleaned++;
      }
    } catch {
      // Ignore invalid job files
    }
  }

  return cleaned;
}
