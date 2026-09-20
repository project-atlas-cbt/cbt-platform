import type { ReactNode } from 'react';

export default function PrintRootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-text-primary print:bg-white print:text-black">
      {children}
    </div>
  );
}
