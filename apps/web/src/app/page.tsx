// Screen: Landing (Bible §33) — explain the problem, promise, workflow, credibility.
import type { Metadata } from "next";
import LandingView from "@/components/landing/LandingView";

export const metadata: Metadata = {
  title: "Founder Intelligence — From uncertainty to evidence-backed decisions",
  description:
    "AI-native market intelligence and decision platform that turns an idea into evidence-backed market understanding and a clear next action.",
};

export default function LandingPage() {
  return <LandingView />;
}
