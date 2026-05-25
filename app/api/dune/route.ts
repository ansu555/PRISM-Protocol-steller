import { NextRequest, NextResponse } from 'next/server';

const DUNE_SIM_BASE = 'https://api.sim.dune.com';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'missing endpoint' }, { status: 400 });
  }

  const forwardParams = new URLSearchParams(searchParams);
  forwardParams.delete('endpoint');
  const qs = forwardParams.size ? `?${forwardParams}` : '';

  try {
    const res = await fetch(`${DUNE_SIM_BASE}/${endpoint}${qs}`, {
      headers: { 'X-Sim-Api-Key': process.env.DUNE_SIM_API_KEY ?? '' },
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'upstream error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
