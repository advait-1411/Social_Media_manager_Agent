import './globals.css';
import LayoutShell from '@/components/layout-shell';
import { Toaster } from 'sonner';
import { SocketProvider } from '@/components/socket-provider';
import { BulkJobProvider } from '@/contexts/bulk-job-context';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SocketProvider>
          <BulkJobProvider>
            <LayoutShell>
              {children}
            </LayoutShell>
          </BulkJobProvider>
          <Toaster position="bottom-right" richColors />
        </SocketProvider>
      </body>
    </html>
  );
}
