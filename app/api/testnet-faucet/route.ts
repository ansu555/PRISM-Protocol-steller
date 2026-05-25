import { NextResponse } from 'next/server';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

const FAUCET_SOL_AMOUNTS = [2, 1, 0.5, 0.1] as const;
const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  'https://api.devnet.solana.com';
const SOLANA_FAUCET_URL = 'https://faucet.solana.com';

async function rpcRequest<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
  });

  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `RPC ${response.status}`);
  }

  return payload.result as T;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string };

    if (!body.address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const publicKey = new PublicKey(body.address);
    let lastError = 'Devnet faucet refused the request.';

    for (const solAmount of FAUCET_SOL_AMOUNTS) {
      try {
        const signature = await rpcRequest<string>('requestAirdrop', [
          publicKey.toBase58(),
          Math.round(solAmount * LAMPORTS_PER_SOL),
        ]);

        return NextResponse.json({ amount: solAmount, signature });
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }

    return NextResponse.json(
      {
        error: lastError,
        faucetUrl: SOLANA_FAUCET_URL,
      },
      { status: 429 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Faucet request failed' },
      { status: 400 },
    );
  }
}
