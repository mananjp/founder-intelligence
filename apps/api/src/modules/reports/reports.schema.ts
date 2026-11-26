import { z } from "zod";
import {
  CreateReportBody,
  QuickBriefReport,
  QuickBriefSections,
  Report,
  ReportKind,
} from "@fi/contracts";

export {
  CreateReportBody,
  QuickBriefReport,
  QuickBriefSections,
  Report,
  ReportKind,
};

export const ReportResponse = z.object({
  data: Report,
});
export type ReportResponse = z.infer<typeof ReportResponse>;

export const ReportListResponse = z.object({
  data: z.array(Report),
});
export type ReportListResponse = z.infer<typeof ReportListResponse>;

