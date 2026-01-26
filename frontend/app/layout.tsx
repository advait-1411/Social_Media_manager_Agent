import './globals.css';
import LayoutShell from '@/components/layout-shell';

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
      </body>
    </html>
  );
}
