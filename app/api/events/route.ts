import { type NextRequest, NextResponse } from 'next/server';

import { addEvent, listEvents } from '@/lib/eventStore';
import { fetchOnChainEvents } from '@/app/lib/onchain-indexer';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const sync = url.searchParams.get('sync') === 'true';
  const summary = url.searchParams.get('summary') === 'true';
  const includeMeta = url.searchParams.get('includeMeta') === 'true';

  if (sync) {
    try {
      const chainEvents = await fetchOnChainEvents(limit);
      for (const event of chainEvents) {
        await addEvent({
          signature: event.signature,
          eventType: event.eventType,
          signer: event.signer,
          success: event.success,
          timestamp: event.timestamp,
          message: `Stellar event: ${event.eventType}`,
          metadata: {
            logs: event.logs,
            operationTypes: event.operationTypes,
            classification: {
              confidence: event.classificationConfidence,
              reason: event.classificationReason,
            },
          },
        });
      }
    } catch (error) {
      console.error('Stellar event sync failed:', error);
    }
  }

  try {
    const events = await listEvents(limit);
    const normalized = events.map((event) => {
      let metadata: Record<string, unknown> | undefined;
      if (event.metadata && typeof event.metadata === 'string') {
        try {
          metadata = JSON.parse(event.metadata) as Record<string, unknown>;
        } catch {
          metadata = { raw: event.metadata };
        }
      } else if (event.metadata && typeof event.metadata === 'object') {
        metadata = event.metadata as Record<string, unknown>;
      }
      return {
        signature: event.signature,
        timestamp: Number(event.timestamp),
        success: event.success,
        eventType: event.event_type,
        signer: event.signer,
        message: event.message,
        metadata,
      };
    });

    const byType: Record<string, number> = {};
    let failed = 0;
    for (const event of normalized) {
      byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
      if (!event.success) failed += 1;
    }

    return NextResponse.json({
      events: normalized.map((event) =>
        includeMeta
          ? event
          : {
              signature: event.signature,
              timestamp: event.timestamp,
              success: event.success,
              eventType: event.eventType,
              signer: event.signer,
              message: event.message,
            },
      ),
      summary: summary
        ? {
            total: normalized.length,
            failures: failed,
            byType,
          }
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await addEvent({
      signature: String(body.signature ?? crypto.randomUUID()),
      eventType: String(body.eventType ?? 'Manual'),
      signer: String(body.signer ?? 'system'),
      success: body.success !== false,
      timestamp: Number(body.timestamp ?? Math.floor(Date.now() / 1000)),
      message: String(body.message ?? ''),
      metadata: body.metadata as Record<string, unknown> | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
