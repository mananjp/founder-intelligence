// Screen: Reports (Bible §33) — Generate and export intelligence.
import type { Metadata } from "next";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";

export const metadata: Metadata = {
  title: "Reports — Founder Intelligence",
  description:
    "Generate evidence-backed quick briefs and export formatted PDFs.",
};

export default function Page() {
  return <ReportsWorkspace />;
}
