import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = false;

const DECK_FILE = 'pitch-deck-20260511-173017.html';

export function GET() {
  const filePath = join(process.cwd(), DECK_FILE);
  let html = readFileSync(filePath, 'utf-8');

  // The standalone HTML uses `public/...` paths so it works when opened
  // directly from disk. When served via Next.js, files in `public/` are
  // exposed at the root, so we strip the `public/` prefix from every
  // src="public/..." attribute.
  html = html.replaceAll('src="public/', 'src="/');

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
