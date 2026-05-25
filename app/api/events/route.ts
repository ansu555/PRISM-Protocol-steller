import { type NextRequest, NextResponse } from 'next/server';
import { listEvents, addEvent } from '@/lib/eventStore';
import { fetchOnChainEvents } from '@/app/lib/onchain-indexer';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const sync = url.searchParams.get('sync') === 'true';

  if (sync) {
    try {
      const chainEvents = await fetchOnChainEvents(undefined, limit);
      
      // Upsert into DB
      for (const e of chainEvents) {
        await addEvent({
          signature: e.signature,
          eventType: e.eventType,
          signer: e.signer,
          success: e.success,
          timestamp: e.timestamp,
          message: `On-chain event: ${e.eventType}`,
          metadata: { logs: e.logs }
        });
      }
    } catch (err) {
      console.error('On-chain sync failed:', err);
    }
  }

  try {
    const events = await listEvents(limit);
    // Convert DB rows to the standard ProtocolEvent format used by the frontend
    const formatted = events.map(e => ({
      signature: e.signature,
      timestamp: Number(e.timestamp),
      success: e.success,
      eventType: e.event_type,
      signer: e.signer,
      message: e.message
    }));
    return NextResponse.json({ events: formatted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await addEvent({
      signature: body.signature,
      eventType: body.eventType,
      signer: body.signer,
      success: body.success ?? true,
      timestamp: body.timestamp || Math.floor(Date.now() / 1000),
      message: body.message,
      metadata: body.metadata
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
