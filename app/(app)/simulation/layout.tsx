import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Simulation Sandbox',
};

export default function SimulationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
