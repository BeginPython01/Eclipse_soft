import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cashcast',
  description: 'Will my money last until the end of the year?',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
