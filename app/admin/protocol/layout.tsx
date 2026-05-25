import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Protocol Setup',
};

export default function ProtocolLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
