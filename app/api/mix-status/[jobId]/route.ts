import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/mix-job-manager';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mix-status/[jobId]
 *
 * Get the status of a mix generation job.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId) {
    return NextResponse.json({ error: 'Missing job ID' }, { status: 400 });
  }

  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}
