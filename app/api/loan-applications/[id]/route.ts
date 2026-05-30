import { type NextRequest, NextResponse } from 'next/server';
import { patchApplication } from '@/lib/loanApplicationStore';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const status = String(body.status ?? '') as 'pending' | 'approved' | 'rejected';
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  try {
    await patchApplication(id, {
      status,
      loanId: body.loanId != null ? Number(body.loanId) : undefined,
      approvedAprBps: body.approvedAprBps != null ? Number(body.approvedAprBps) : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
