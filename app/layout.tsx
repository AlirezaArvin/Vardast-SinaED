import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'وردست | مدیریت بیماران بستری',
  description: 'سامانه فارسی ثبت شرح حال و دستورات بیماران بستری',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
