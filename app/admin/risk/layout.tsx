import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Risk Engine',
};

export default function RiskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
