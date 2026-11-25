import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Витрина ОМС — Т-Банк',
  description: 'Продовая витрина золотого счета: конфигуратор, 3D-просмотр и флоу открытия счета.',
};

export const viewport: Viewport = { viewportFit: 'cover', themeColor: '#fff' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
