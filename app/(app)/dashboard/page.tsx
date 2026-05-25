import { Metadata } from 'next';
import { SimulationHarness } from "@/components/simulation/SimulationHarness";

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function DashboardPage() {
  return (
    <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain] px-4 pt-7 pb-4">
      <SimulationHarness />
    </div>
  );
}
