import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Loan Operations',
};

export default function LoansLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
