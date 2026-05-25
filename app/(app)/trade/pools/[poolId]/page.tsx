import { PrismPoolDetail } from '@/components/simulation/PrismAppSurfaces';

export default async function TradePoolPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;

  return (
    <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain]">
      <PrismPoolDetail poolId={poolId} />
    </div>
  );
}
