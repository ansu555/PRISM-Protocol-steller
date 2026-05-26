import { NextResponse } from 'next/server';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string };

    if (!body.address) {
      return NextResponse.json({ error: 'Stellar address is required' }, { status: 400 });
    }

    const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(body.address)}`);

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Friendbot failed: ${text.slice(0, 200)}`, faucetUrl: FRIENDBOT_URL },
        { status: 429 },
      );
    }

    const json = await res.json();
    return NextResponse.json({
      amount: 10000,
      signature: json.hash ?? json.id ?? 'ok',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Faucet request failed' },
      { status: 400 },
    );
  }
}
