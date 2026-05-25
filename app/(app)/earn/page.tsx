import { Metadata } from 'next';
import { MarketOverview } from '@/components/dashboard/MarketOverview';

export const metadata: Metadata = {
  title: 'Marketplace',
};

export default function EarnPage() {
  return (
    <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain] px-4 pt-7 pb-4">
      <MarketOverview />
    </div>
  );
}
