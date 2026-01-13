import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/mix-job-manager';

/**
 * GET /api/mix-status/[jobId]
 *
 * Poll for mix generation job status.
 *
 * Response:
 * - status: 'pending' | 'processing' | 'complete' | 'failed'
 * - progress: 0-100
 * - progressMessage: string
 * - result?: { mixUrl, tracklist, duration, ... } (when complete)
 * - error?: string (when failed)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }

    const job = getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found. It may have expired (jobs are deleted after 24 hours).' },
        { status: 404 }
      );
    }

    // Return job status
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      progressMessage: job.progressMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.result && { result: job.result }),
      ...(job.error && { error: job.error }),
    });
  } catch (error) {
    console.error('Mix status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
