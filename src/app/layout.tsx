import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'จดตัง',
  description: 'เงินจะพอใช้ถึงสิ้นเดือนไหม?',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
