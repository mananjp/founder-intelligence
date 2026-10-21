import "@fi/ui/src/tokens.css";
import type { ReactNode } from "react";
import { ToastViewport } from "@/components/ToastViewport";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata = {
  title: "Founder Intelligence",
  description: "Evidence-backed market intelligence for founders.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          background: "var(--fi-bg)",
          color: "var(--fi-text)",
          fontFamily: "var(--fi-font-body)",
          margin: 0,
        }}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <ToastViewport />
      </body>
    </html>
  );
}
