import { Router, type Request, type Response } from "express";
import { queryTable, callOrchestration } from "../services/ais-client.js";
import { buildOrchestrationPayload } from "../services/orch-mapper.js";
import type { AisOperator } from "../types.js";

const router = Router();

// ──────────────────────────────────────────────────────────────
// GET /api/purchase-orders — Paginated PO list
// ──────────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { supplier, branch, statusFrom, statusTo, dateFrom, dateTo, pageSize } =
      req.query;

    const filters: Array<{
      column: string;
      operator: AisOperator;
      value: string;
    }> = [];

    if (supplier)
      filters.push({
        column: "AN8",
        operator: "EQUAL",
        value: String(supplier),
      });
    if (branch)
      filters.push({
        column: "MCU",
        operator: "EQUAL",
        value: String(branch),
      });
    if (statusFrom)
      filters.push({
        column: "NXTR",
        operator: "GREATER_EQUAL",
        value: String(statusFrom),
      });
    if (statusTo)
      filters.push({
        column: "NXTR",
        operator: "LESS_EQUAL",
        value: String(statusTo),
      });
    if (dateFrom)
      filters.push({
        column: "TRDJ",
        operator: "GREATER_EQUAL",
        value: String(dateFrom),
      });
    if (dateTo)
      filters.push({
        column: "TRDJ",
        operator: "LESS_EQUAL",
        value: String(dateTo),
      });

    // Default: open POs only
    if (!statusFrom && !statusTo) {
      filters.push({ column: "NXTR", operator: "LESS", value: "999" });
    }

    const maxRows = Math.min(Number(pageSize) || 50, 200);

    const resp = await queryTable({
      tableName: "F4301",
      columns: [
        "DOCO", "DCTO", "KCOO", "AN8", "SHAN", "MCU",
        "TRDJ", "DRQJ", "PDDJ", "OTOT", "HOLD", "NXTR",
        "VR01", "CRCD", "PY", "TXA1", "AN8R",
      ],
      filters,
      maxRows,
    });

    const grid = resp.fs_DATABROWSE?.data?.gridData;
    const rows = grid?.rowset ?? [];

    res.json({
      data: rows,
      total: grid?.summary?.records ?? rows.length,
      hasMore: grid?.summary?.moreRecords ?? false,
    });
  } catch (err) {
    console.error("PO list error:", err);
    res.status(500).json({ error: "Failed to fetch purchase orders" });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/purchase-orders/pending-approvals
// ──────────────────────────────────────────────────────────────

router.get(
  "/pending-approvals",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = (await callOrchestration(
        "poApprovals",
        {}
      )) as Record<string, unknown>;
      const list = Array.isArray(result?.poList) ? result.poList : [];
      res.json({ data: list, total: list.length });
    } catch (err) {
      console.error("Pending approvals error:", err);
      res.status(500).json({ error: "Failed to fetch pending approvals" });
    }
  }
);

// ──────────────────────────────────────────────────────────────
// POST /api/purchase-orders/:orderNumber/approve
// ──────────────────────────────────────────────────────────────

router.post(
  "/:orderNumber/approve",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { orchestrationName, inputs } = await buildOrchestrationPayload(
        "approvePurchaseOrder",
        { orderNumber: req.params.orderNumber }
      );
      const result = await callOrchestration(orchestrationName, inputs);
      res.json(result);
    } catch (err) {
      console.error("Approve PO error:", err);
      res.status(500).json({ error: "Failed to approve purchase order" });
    }
  }
);

// ──────────────────────────────────────────────────────────────
// POST /api/purchase-orders/:orderNumber/reject
// ──────────────────────────────────────────────────────────────

router.post(
  "/:orderNumber/reject",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { remark, P43081_Version } = req.body;
      const { orchestrationName, inputs } = await buildOrchestrationPayload(
        "rejectPurchaseOrder",
        {
          orderNumber: req.params.orderNumber,
          remark,
          P43081_Version,
        }
      );
      const result = await callOrchestration(orchestrationName, inputs);
      res.json(result);
    } catch (err) {
      console.error("Reject PO error:", err);
      res.status(500).json({ error: "Failed to reject purchase order" });
    }
  }
);

// ──────────────────────────────────────────────────────────────
// GET /api/purchase-orders/:orderNumber — PO detail (header + lines)
// ──────────────────────────────────────────────────────────────

router.get(
  "/:orderNumber",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderNumber = req.params.orderNumber;

      const [headerResp, detailResp] = await Promise.all([
        queryTable({
          tableName: "F4301",
          columns: [
            "DOCO", "DCTO", "KCOO", "AN8", "SHAN", "MCU",
            "TRDJ", "DRQJ", "PDDJ", "OTOT", "HOLD", "NXTR",
            "VR01", "CRCD", "PY", "TXA1", "AN8R",
          ],
          filters: [
            { column: "DOCO", operator: "EQUAL", value: orderNumber },
          ],
          maxRows: 1,
        }),
        queryTable({
          tableName: "F4311",
          columns: [
            "DOCO", "DCTO", "KCOO", "LNID", "AN8", "SHAN",
            "LITM", "DSC1", "UORG", "UREQ", "UOPN", "PRRC",
            "AEXP", "AOPN", "LNTY", "NXTR", "LTTR", "MCU",
            "TRDJ", "DRQJ", "PDDJ", "CRCD", "FUP", "FREC",
            "UOM", "ABAN8",
          ],
          filters: [
            { column: "DOCO", operator: "EQUAL", value: orderNumber },
          ],
          maxRows: 200,
        }),
      ]);

      const header =
        headerResp.fs_DATABROWSE?.data?.gridData?.rowset?.[0] ?? null;
      const lines =
        detailResp.fs_DATABROWSE?.data?.gridData?.rowset ?? [];

      if (!header && lines.length === 0) {
        res.status(404).json({ error: "Purchase order not found" });
        return;
      }

      res.json({ header, lines, lineCount: lines.length });
    } catch (err) {
      console.error("PO detail error:", err);
      res
        .status(500)
        .json({ error: "Failed to fetch purchase order details" });
    }
  }
);

export default router;
