import { LoadingState } from "@/components/WorkspaceState";

export default function Loading() {
  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 72px" }}>
      <LoadingState label="Loading reports..." />
    </main>
  );
}

