import './globals.css';
import LayoutShell from '@/components/layout-shell';
import { Toaster } from 'sonner';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <LayoutShell>
          {children}
        </LayoutShell>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
