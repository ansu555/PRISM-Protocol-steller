import { notFound } from 'next/navigation';

import { PrismVaultDetail } from '@/components/simulation/PrismAppSurfaces';

export default async function EarnVaultDetailPage({
  params,
}: {
  params: Promise<{ vaultId: string }>;
}) {
  const { vaultId } = await params;

  if (isNaN(Number(vaultId)) || Number(vaultId) < 0) {
    notFound();
  }

  return (
    <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain]">
      <PrismVaultDetail vaultId={vaultId} />
    </div>
  );
}
