import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--fuente-sora' });

export const metadata: Metadata = {
  title: 'Sales Agent · Pruebas',
  description: 'Página de pruebas del agente conversacional de Sales Agent.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#071A33',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={sora.variable}>
      <body>{children}</body>
    </html>
  );
}
