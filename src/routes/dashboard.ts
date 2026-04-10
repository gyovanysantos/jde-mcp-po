import { Router, type Request, type Response } from "express";
import { queryTable, callOrchestration } from "../services/ais-client.js";

const router = Router();

// ──────────────────────────────────────────────────────────────
// JDE date parsing — handles Julian (CYYDDD) and ISO (YYYY-MM-DD)
// ──────────────────────────────────────────────────────────────

function parseJDEDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "" || raw === 0) return null;
  const str = String(raw);

  // ISO format
  if (str.includes("-")) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // JDE Julian: CYYDDD (C=0 → 19xx, C=1 → 20xx)
  const num = parseInt(str, 10);
  if (isNaN(num) || num < 1000) return null;
  const century = Math.floor(num / 100000);
  const yearDay = num % 100000;
  const year = (century === 1 ? 2000 : 1900) + Math.floor(yearDay / 1000);
  const dayOfYear = yearDay % 1000;
  const d = new Date(year, 0, dayOfYear);
  return isNaN(d.getTime()) ? null : d;
}

function col(row: Record<string, unknown>, alias: string, table: string): unknown {
  return row[`${table}_${alias}`] ?? row[alias];
}

// ──────────────────────────────────────────────────────────────
// GET /api/dashboard/kpis — Aggregated KPI cards
// ──────────────────────────────────────────────────────────────

router.get("/kpis", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [openPOsResp, pendingApprovalsResp] = await Promise.all([
      queryTable({
        tableName: "F4311",
        columns: ["DOCO", "AOPN", "NXTR", "TRDJ", "PDDJ"],
        filters: [
          { column: "NXTR", operator: "LESS", value: "999" },
          { column: "AOPN", operator: "GREATER", value: "0" },
        ],
        maxRows: 500,
      }),
      callOrchestration("poApprovals", {}),
    ]);

    const openRows = openPOsResp.fs_DATABROWSE?.data?.gridData?.rowset ?? [];
    const approvalData = pendingApprovalsResp as Record<string, unknown>;
    const approvalList = Array.isArray(approvalData?.poList)
      ? approvalData.poList
      : [];

    // Unique open PO count
    const uniquePOs = new Set(
      openRows.map((r) => col(r, "DOCO", "F4311"))
    );

    // Total open PO value
    const totalOpenValue = openRows.reduce((sum, r) => {
      return sum + Number(col(r, "AOPN", "F4311") ?? 0);
    }, 0);

    // Overdue PO lines (promised date < today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueCount = openRows.filter((r) => {
      const pddj = col(r, "PDDJ", "F4311");
      const promised = parseJDEDate(pddj);
      return promised !== null && promised < today;
    }).length;

    res.json({
      openPOCount: uniquePOs.size,
      openPOValue: Math.round(totalOpenValue * 100) / 100,
      pendingApprovals: approvalList.length,
      overduePOLines: overdueCount,
      totalOpenLines: openRows.length,
      hasMoreData:
        openPOsResp.fs_DATABROWSE?.data?.gridData?.summary?.moreRecords ??
        false,
    });
  } catch (err) {
    console.error("Dashboard KPI error:", err);
    res.status(500).json({ error: "Failed to fetch KPI data" });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/dashboard/po-aging — PO aging distribution
// ──────────────────────────────────────────────────────────────

router.get(
  "/po-aging",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const resp = await queryTable({
        tableName: "F4311",
        columns: ["DOCO", "TRDJ", "AOPN"],
        filters: [
          { column: "NXTR", operator: "LESS", value: "999" },
          { column: "AOPN", operator: "GREATER", value: "0" },
        ],
        maxRows: 500,
      });

      const rows = resp.fs_DATABROWSE?.data?.gridData?.rowset ?? [];
      const today = new Date();
      const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      const bucketValues = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

      for (const row of rows) {
        const trdj = col(row, "TRDJ", "F4311");
        const amount = Number(col(row, "AOPN", "F4311") ?? 0);
        const orderDate = parseJDEDate(trdj);
        if (!orderDate) continue;
        const ageDays = Math.floor(
          (today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const key =
          ageDays <= 30
            ? "0-30"
            : ageDays <= 60
              ? "31-60"
              : ageDays <= 90
                ? "61-90"
                : "90+";
        buckets[key]++;
        bucketValues[key] += amount;
      }

      res.json({
        buckets: Object.entries(buckets).map(([range, count]) => ({
          range,
          count,
          value: Math.round(
            bucketValues[range as keyof typeof bucketValues] * 100
          ) / 100,
        })),
        totalLines: rows.length,
      });
    } catch (err) {
      console.error("PO aging error:", err);
      res.status(500).json({ error: "Failed to fetch PO aging data" });
    }
  }
);

// ──────────────────────────────────────────────────────────────
// GET /api/dashboard/cash-flow — Weekly cash flow projection
// ──────────────────────────────────────────────────────────────

router.get(
  "/cash-flow",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const resp = await queryTable({
        tableName: "F4311",
        columns: ["PDDJ", "AOPN"],
        filters: [
          { column: "NXTR", operator: "LESS", value: "999" },
          { column: "AOPN", operator: "GREATER", value: "0" },
        ],
        maxRows: 500,
      });

      const rows = resp.fs_DATABROWSE?.data?.gridData?.rowset ?? [];
      const weekBuckets = new Map<string, number>();

      for (const row of rows) {
        const pddj = col(row, "PDDJ", "F4311");
        const amount = Number(col(row, "AOPN", "F4311") ?? 0);
        const date = parseJDEDate(pddj);
        if (!date) continue;

        // Monday of that week
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        const key = weekStart.toISOString().split("T")[0];
        weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + amount);
      }

      const projections = [...weekBuckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 8)
        .map(([weekStart, amount]) => ({
          weekStart,
          projectedAmount: Math.round(amount * 100) / 100,
        }));

      res.json({ projections });
    } catch (err) {
      console.error("Cash flow error:", err);
      res.status(500).json({ error: "Failed to fetch cash flow data" });
    }
  }
);

export default router;
