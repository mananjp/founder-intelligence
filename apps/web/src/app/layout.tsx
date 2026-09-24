import "@fi/ui/src/tokens.css";
import type { ReactNode } from "react";

export const metadata = { title: "Founder Intelligence", description: "Evidence-backed market intelligence for founders." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "var(--fi-bg)", color: "var(--fi-text)", fontFamily: "var(--fi-font-body)", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
