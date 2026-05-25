import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Borrower Facility',
};

export default function BorrowLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
