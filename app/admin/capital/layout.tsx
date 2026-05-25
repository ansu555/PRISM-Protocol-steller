import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Capital Management',
};

export default function CapitalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
