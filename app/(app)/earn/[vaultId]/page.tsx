'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { VaultDetail } from '@/components/dashboard/VaultDetail';

export default function VaultPage() {
  const params = useParams();
  const vaultIdStr = params.vaultId as string;
  const vaultId = parseInt(vaultIdStr, 10);

  useEffect(() => {
    if (!isNaN(vaultId)) {
      document.title = `Credit Vault #${vaultId} | PRISM Protocol`;
    }
  }, [vaultId]);

  return (
    <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain]">
      <div className="mx-auto max-w-[1600px] px-4 pt-7 pb-4">
        <VaultDetail vaultId={vaultId} />
      </div>
    </div>
  );
}
