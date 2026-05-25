import { Metadata } from 'next';
import { PrismProtect } from '@/components/simulation/PrismAppSurfaces';

export const metadata: Metadata = {
  title: 'Risk Engine',
};

export default function ProtectPage() {
  return (
    <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain]">
      <PrismProtect />
    </div>
  );
}
