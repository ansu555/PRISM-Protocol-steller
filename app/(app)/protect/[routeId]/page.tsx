import { notFound } from 'next/navigation';
import { PrismProtectDetail } from '@/components/simulation/PrismAppSurfaces';

export default async function ProtectRouteDetailPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = await params;

  if (routeId !== '0' && routeId !== '1') {
    notFound();
  }

  return (
    <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain]">
      <PrismProtectDetail routeId={routeId as '0' | '1'} />
    </div>
  );
}
