import { z } from "zod";
import {
  ResearchDepth,
  StartResearchRun,
  RunState,
  RunEvent,
  ResearchRun,
} from "@fi/contracts";

export { ResearchDepth, StartResearchRun, RunState, RunEvent, ResearchRun };

export const ResearchRunResponse = z.object({
  data: ResearchRun,
});
export type ResearchRunResponse = z.infer<typeof ResearchRunResponse>;

export const ResearchRunListResponse = z.object({
  data: z.array(ResearchRun),
});
export type ResearchRunListResponse = z.infer<typeof ResearchRunListResponse>;

