import { NextRequest, NextResponse } from 'next/server';

async function handleProxy(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_IKA_FULLNODE_URL || 'https://sui-testnet-rpc.publicnode.com';
    const method = req.method;
    
    // Forward relevant headers from the client
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'PRISM-Proxy/1.0',
    };
    
    // Copy Sui-specific headers if present
    req.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('client-')) {
        headers[key] = value;
      }
    });

    let body = undefined;
    let methodName = 'unknown';
    let params = [];
    if (method === 'POST') {
      const text = await req.text();
      body = text;
      try {
        const json = JSON.parse(text);
        methodName = json.method || 'unknown';
        params = json.params || [];
      } catch (e) {}
    }

    const primaryUrl = process.env.NEXT_PUBLIC_IKA_FULLNODE_URL || 'https://sui-testnet-rpc.publicnode.com';
    const fallbackUrl = process.env.NEXT_PUBLIC_IKA_FALLBACK_RPC_URL || 'https://fullnode.testnet.sui.io:443';
    
    const tryFetch = async (targetUrl: string) => {
      return fetch(targetUrl, {
        method,
        headers,
        body,
      });
    };

    console.log(`[SUI PROXY] Upstream request: ${method} ${methodName}`, JSON.stringify(params).substring(0, 200));
    
    let response;
    try {
      response = await tryFetch(primaryUrl);
      if (!response.ok && primaryUrl !== fallbackUrl) {
        console.warn(`[SUI PROXY] Primary RPC failed (${response.status}), trying fallback...`);
        response = await tryFetch(fallbackUrl);
      }
    } catch (e) {
      console.warn(`[SUI PROXY] Primary RPC connection failed, trying fallback...`, e);
      response = await tryFetch(fallbackUrl);
    }

    if (!response.ok) {
      console.error(`[SUI PROXY] Upstream error: ${response.status} ${response.statusText}`);
      return new NextResponse(await response.text(), { status: response.status });
    }

    const data = await response.json();
    console.log(`[SUI PROXY] Upstream response for ${methodName}:`, JSON.stringify(data).substring(0, 500));
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[SUI PROXY] Proxy error:', error);
    return new NextResponse(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(req: NextRequest) {
  return handleProxy(req);
}

export async function GET(req: NextRequest) {
  return handleProxy(req);
}
