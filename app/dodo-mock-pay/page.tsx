/**
 * Local Dodo checkout simulator. Used only when MOCK_DODO=true and the
 * sandbox API keys haven't been provisioned yet. Mimics the look-and-flow
 * of Dodo's hosted page just enough to demo the integration.
 *
 * On "Pay Now": POSTs to /api/dodo/mock-webhook (which signs the payload
 * with DODO_WEBHOOK_SECRET and forwards to /api/dodo/webhook) then redirects
 * back to the borrower flow. The success path is byte-identical to the real
 * Dodo flow from the borrower UI's perspective.
 */

import { Suspense } from 'react';
import DodoMockPayContent from './content';

export default function DodoMockPayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white/40 text-sm font-mono">Loading checkout…</div>
      </div>
    }>
      <DodoMockPayContent />
    </Suspense>
  );
}
