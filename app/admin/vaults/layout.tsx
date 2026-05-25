import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vault Deployment',
};

export default function VaultsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
