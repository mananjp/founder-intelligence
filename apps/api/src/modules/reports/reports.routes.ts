import { Router } from "express";
import { requireRole, requireWorkspace } from "../../middleware/auth.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { CreateReportBody } from "./reports.schema.js";
import { reportsService } from "./reports.service.js";
import { renderQuickBriefPdf } from "./reports.pdf.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const reportsRouter = Router({ mergeParams: true });
reportsRouter.use((req, _res, next) => {
  const workspaceId = req.params.workspaceId;
  if (typeof workspaceId !== "string" || !UUID_REGEX.test(workspaceId)) {
    throw new HttpError(400, "invalid_workspace", "Malformed workspace id");
  }
  next();
});
reportsRouter.use(requireWorkspace);

function safeFilenameSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "quick-brief";
}

// GET /v1/workspaces/:workspaceId/ideas/:ideaId/reports
reportsRouter.get("/", async (req, res) => {
  const { ideaId } = req.params as { ideaId: string };
  const reports = await reportsService.list(req.workspaceId!, ideaId);
  res.json({ data: reports });
});

// POST /v1/workspaces/:workspaceId/ideas/:ideaId/reports
reportsRouter.post(
  "/",
  requireRole("member"),
  validate({ body: CreateReportBody.optional() }),
  async (req, res) => {
    const { ideaId } = req.params as { ideaId: string };
    const result = await reportsService.generateQuickBrief(
      req.workspaceId!,
      ideaId,
      req.body ?? {},
    );
    res.status(result.created ? 201 : 200).json({ data: result.report });
  },
);

// GET /v1/workspaces/:workspaceId/ideas/:ideaId/reports/:reportId
reportsRouter.get("/:reportId", async (req, res) => {
  const { ideaId, reportId } = req.params as {
    ideaId: string;
    reportId: string;
  };
  const report = await reportsService.get(req.workspaceId!, ideaId, reportId);
  res.json({ data: report });
});

// GET /v1/workspaces/:workspaceId/ideas/:ideaId/reports/:reportId/pdf
reportsRouter.get("/:reportId/pdf", async (req, res) => {
  const { ideaId, reportId } = req.params as {
    ideaId: string;
    reportId: string;
  };
  const report = await reportsService.getQuickBriefForPdf(
    req.workspaceId!,
    ideaId,
    reportId,
  );
  const pdf = await renderQuickBriefPdf(report);
  const slug = safeFilenameSlug(report.sections.metadata.ideaTitle);
  const filename = `fi-quick-brief-${slug}-v${report.version}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Length", String(pdf.length));
  res.status(200).send(pdf);
});

