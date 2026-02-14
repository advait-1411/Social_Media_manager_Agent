import './globals.css';
import LayoutShell from '@/components/layout-shell';
import { Toaster } from 'sonner';
import { SocketProvider } from '@/components/socket-provider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SocketProvider>
          <LayoutShell>
            {children}
          </LayoutShell>
          <Toaster position="bottom-right" richColors />
        </SocketProvider>
      </body>
    </html>
  );
}
