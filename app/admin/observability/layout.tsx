import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Protocol Observability',
};

export default function ObservabilityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
