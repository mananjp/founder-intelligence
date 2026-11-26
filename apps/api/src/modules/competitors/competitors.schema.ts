import { z } from "zod";
import { CompetitorClass } from "@fi/contracts";

export const listCompetitorsQuery = z.object({
  kind: CompetitorClass.optional(),
});
export type ListCompetitorsQuery = z.infer<typeof listCompetitorsQuery>;
