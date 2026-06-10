export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/security-master-loader';

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const { jobId } = params;
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    jobId,
    status: job.status,
    progress: Number(job.progress ?? 0),
    filename: job.filename,
    format: job.format,
    exchange: job.exchange,
    totalRows: job.totalRows ? Number(job.totalRows) : undefined,
    valid: job.valid ? Number(job.valid) : undefined,
    invalid: job.invalid ? Number(job.invalid) : undefined,
    loaded: job.loaded ? Number(job.loaded) : undefined,
    durationMs: job.durationMs ? Number(job.durationMs) : undefined,
    error: job.error,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
  });
}
