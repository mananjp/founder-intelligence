"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  Competitor,
  CompetitorClass,
  CompetitorDetail,
} from "@fi/contracts";
import { CompetitorsMatrix } from "@/components/CompetitorsMatrix";
import { apiFetch } from "@/lib/apiClient";

export default function Page() {
  const params = useParams<{ workspaceId: string; ideaId: string }>();
  const workspaceId = params.workspaceId ?? "";
  const ideaId = params.ideaId ?? "";

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<CompetitorClass | "all">(
    "all",
  );

  const [selectedCompetitorId, setSelectedCompetitorId] = useState<
    string | null
  >(null);
  const [detail, setDetail] = useState<CompetitorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadCompetitors = useCallback(async () => {
    if (!workspaceId || !ideaId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch<{ data: Competitor[] }>(
        `/v1/workspaces/${workspaceId}/ideas/${ideaId}/competitors`,
      );
      setCompetitors(res.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't load the competitors matrix.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, ideaId]);

  const inspectCompetitor = useCallback(
    async (competitorId: string) => {
      if (!workspaceId || !ideaId) return;
      setSelectedCompetitorId(competitorId);
      setDetail(null);
      setDetailError(null);
      try {
        setDetailLoading(true);
        const res = await apiFetch<{ data: CompetitorDetail }>(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/competitors/${competitorId}`,
        );
        setDetail(res.data);
      } catch (err) {
        setDetailError(
          err instanceof Error
            ? err.message
            : "We couldn't load linked claims for this competitor.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [workspaceId, ideaId],
  );

  useEffect(() => {
    void loadCompetitors();
  }, [loadCompetitors]);

  return (
    <CompetitorsMatrix
      workspaceId={workspaceId}
      ideaId={ideaId}
      competitors={competitors}
      loading={loading}
      error={error}
      selectedClass={selectedClass}
      onSelectClass={setSelectedClass}
      onRetry={() => void loadCompetitors()}
      selectedCompetitorId={selectedCompetitorId}
      detail={detail}
      detailLoading={detailLoading}
      detailError={detailError}
      onInspectCompetitor={(id) => void inspectCompetitor(id)}
    />
  );
}
