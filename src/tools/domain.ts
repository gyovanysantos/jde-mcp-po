import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  JdePurchaseOrderInquirySchema,
  JdeCreatePurchaseOrderSchema,
  JdeUpdatePurchaseOrderSchema,
  JdeAddPurchaseOrderLineSchema,
  JdeCancelPurchaseOrderSchema,
  JdeSupplierLookupSchema,
  JdeItemCheckSchema,
  type JdePurchaseOrderInquiryInput,
  type JdeCreatePurchaseOrderInput,
  type JdeUpdatePurchaseOrderInput,
  type JdeAddPurchaseOrderLineInput,
  type JdeCancelPurchaseOrderInput,
  type JdeSupplierLookupInput,
  type JdeItemCheckInput,
} from "../schemas/tools.js";
import { queryTable, callOrchestration } from "../services/ais-client.js";
import { buildOrchestrationPayload } from "../services/orch-mapper.js";
import { CHARACTER_LIMIT } from "../constants.js";
import type { AisOperator } from "../types.js";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

interface FilterDef {
  column: string;
  operator: AisOperator;
  value: string | string[];
}

function addFilter(
  filters: FilterDef[],
  column: string,
  operator: AisOperator,
  value: string | number | undefined
): void {
  if (value === undefined || value === "") return;
  filters.push({ column, operator, value: String(value) });
}

function truncate(text: string, records?: number): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n... [TRUNCATED — ${records ?? "many"} total records. Narrow your criteria.]`
  );
}

function formatQueryResult(
  label: string,
  tableName: string,
  gridData: {
    summary: { records: number; moreRecords: boolean };
    rowset: Array<Record<string, unknown>>;
  }
): { content: Array<{ type: "text"; text: string }> } {
  const output = {
    label,
    tableName,
    totalRecords: gridData.summary.records,
    returnedRecords: gridData.rowset.length,
    hasMore: gridData.summary.moreRecords,
    rows: gridData.rowset,
  };
  return {
    content: [
      { type: "text" as const, text: truncate(JSON.stringify(output, null, 2), gridData.summary.records) },
    ],
  };
}

function orchResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: truncate(JSON.stringify(data, null, 2)) }],
  };
}

function orchError(operation: string, err: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error in ${operation}: ${msg}` }],
  };
}

// ══════════════════════════════════════════════════════════════
// READ — Purchase Order Inquiry
// ══════════════════════════════════════════════════════════════

export function registerPurchaseOrderInquiry(server: McpServer): void {
  server.registerTool(
    "jde_purchase_order_inquiry",
    {
      title: "JDE Purchase Order Inquiry",
      description: `Query purchase order detail lines (F4311) and optionally the header (F4301).

Use for: "show me PO 54321", "what are the open POs for supplier 5001",
"find all POs with item RAW-STEEL-01", "what's on order at branch M30".

All filters are optional — combine them to narrow results.

Common status ranges (NXTR):
  220-280: open, awaiting approval/receipt
  300-400: approved, awaiting receipt
  400-500: partially received
  999: closed/completed

Args:
  - orderNumber, supplierNumber, supplierName, itemNumber, branchPlant
  - orderType (default OP), statusFrom, statusTo
  - includeHeader: also return F4301 header row
  - maxRows (default 50)`,
      inputSchema: JdePurchaseOrderInquirySchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: JdePurchaseOrderInquiryInput) => {
      try {
        // If supplierName provided, resolve to AN8 first
        let resolvedAN8 = params.supplierNumber;
        if (params.supplierName && !resolvedAN8) {
          const suppResp = await queryTable({
            tableName: "F0101",
            columns: ["AN8", "ALPH"],
            filters: [
              { column: "ALPH", operator: "STR_CONTAIN", value: params.supplierName },
              { column: "AT1", operator: "EQUAL", value: "V" },
            ],
            maxRows: 5,
          });
          const suppRows = suppResp.fs_DATABROWSE?.data?.gridData?.rowset;
          if (suppRows && suppRows.length > 0) {
            resolvedAN8 = Number(suppRows[0]["F0101_AN8"] ?? suppRows[0]["AN8"]);
          } else {
            return {
              content: [{
                type: "text" as const,
                text: `No supplier found matching "${params.supplierName}". Try jde_supplier_lookup for more options.`,
              }],
            };
          }
        }

        const filters: FilterDef[] = [];
        addFilter(filters, "DOCO", "EQUAL", params.orderNumber);
        addFilter(filters, "AN8", "EQUAL", resolvedAN8);
        addFilter(filters, "LITM", "STR_CONTAIN", params.itemNumber);
        addFilter(filters, "MCU", "EQUAL", params.branchPlant);
        addFilter(filters, "DCTO", "EQUAL", params.orderType);
        addFilter(filters, "NXTR", "GREATER_EQUAL", params.statusFrom);
        addFilter(filters, "NXTR", "LESS_EQUAL", params.statusTo);

        const detailCols = [
          "DOCO", "DCTO", "KCOO", "LNID", "AN8", "SHAN", "LITM", "DSC1",
          "UORG", "UREQ", "UOPN", "PRRC", "AEXP", "LNTY",
          "NXTR", "LTTR", "MCU", "TRDJ", "DRQJ", "PDDJ",
        ];

        const detailResp = await queryTable({
          tableName: "F4311",
          columns: detailCols,
          filters,
          maxRows: params.maxRows,
        });

        const detailGrid = detailResp.fs_DATABROWSE?.data?.gridData;
        if (!detailGrid || detailGrid.rowset.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No purchase order lines found matching the criteria." }],
          };
        }

        // Optionally fetch header
        let headerData: unknown = null;
        if (params.includeHeader && params.orderNumber) {
          const headerResp = await queryTable({
            tableName: "F4301",
            columns: ["DOCO", "DCTO", "KCOO", "AN8", "SHAN", "MCU", "TRDJ", "DRQJ", "PDDJ", "OTOT", "HOLD", "NXTR", "VR01"],
            filters: [{ column: "DOCO", operator: "EQUAL", value: String(params.orderNumber) }],
            maxRows: 1,
          });
          const hGrid = headerResp.fs_DATABROWSE?.data?.gridData;
          if (hGrid && hGrid.rowset.length > 0) {
            headerData = hGrid.rowset[0];
          }
        }

        const output = {
          label: "Purchase Order Inquiry",
          ...(headerData ? { header: headerData } : {}),
          detail: {
            tableName: "F4311",
            totalRecords: detailGrid.summary.records,
            returnedRecords: detailGrid.rowset.length,
            hasMore: detailGrid.summary.moreRecords,
            rows: detailGrid.rowset,
          },
        };

        return {
          content: [{ type: "text" as const, text: truncate(JSON.stringify(output, null, 2), detailGrid.summary.records) }],
        };
      } catch (err) {
        return orchError("jde_purchase_order_inquiry", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// CREATE — New Purchase Order
// ══════════════════════════════════════════════════════════════

export function registerCreatePurchaseOrder(server: McpServer): void {
  server.registerTool(
    "jde_create_purchase_order",
    {
      title: "Create JDE Purchase Order",
      description: `Create a new purchase order in JDE via orchestration (P4310).

This calls the configured "createPurchaseOrder" orchestration, which drives P4310 to create a header and one or more detail lines. JDE business rules (costing, approval, supplier validation) are enforced by the orchestration.

⚠️ This CREATES data in JDE. Confirm details with the user before calling.

Args:
  - supplierNumber (required): Supplier AN8
  - shipToNumber: Ship-to AN8 (defaults to branch)
  - branchPlant (required): Default branch/plant (MCU)
  - orderType: Default "OP"
  - orderDate, requestedDate, supplierReference
  - lines[]: At least one line with itemNumber and quantity

Returns: Orchestration response with the new PO number.`,
      inputSchema: JdeCreatePurchaseOrderSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: JdeCreatePurchaseOrderInput) => {
      try {
        const { orchestrationName, inputs } = await buildOrchestrationPayload(
          "createPurchaseOrder",
          params as unknown as Record<string, unknown>
        );
        const result = await callOrchestration(orchestrationName, inputs);
        return orchResult(result);
      } catch (err) {
        return orchError("jde_create_purchase_order", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// UPDATE — Existing Purchase Order Line
// ══════════════════════════════════════════════════════════════

export function registerUpdatePurchaseOrder(server: McpServer): void {
  server.registerTool(
    "jde_update_purchase_order",
    {
      title: "Update JDE Purchase Order Line",
      description: `Update an existing purchase order detail line in JDE via orchestration (P4310 EditLine).

Use to change quantity, cost, dates, or branch on a specific line of an existing PO.

⚠️ This MODIFIES data in JDE. Confirm changes with the user before calling.

Args:
  - orderNumber (required): DOCO
  - lineNumber (required): LNID (e.g. 1000 = line 1)
  - orderType, orderCompany
  - quantity, unitCost, requestedDate, promisedDate, branchPlant (all optional — only changed fields)

Returns: Orchestration response confirming the update.`,
      inputSchema: JdeUpdatePurchaseOrderSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (params: JdeUpdatePurchaseOrderInput) => {
      try {
        const { orchestrationName, inputs } = await buildOrchestrationPayload(
          "updatePurchaseOrderLine",
          params as unknown as Record<string, unknown>
        );
        const result = await callOrchestration(orchestrationName, inputs);
        return orchResult(result);
      } catch (err) {
        return orchError("jde_update_purchase_order", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// ADD LINE — to Existing Purchase Order
// ══════════════════════════════════════════════════════════════

export function registerAddPurchaseOrderLine(server: McpServer): void {
  server.registerTool(
    "jde_add_purchase_order_line",
    {
      title: "Add Lines to JDE Purchase Order",
      description: `Add one or more new detail lines to an existing JDE purchase order via orchestration.

⚠️ This MODIFIES data in JDE. Confirm with the user before calling.

Args:
  - orderNumber (required): Existing DOCO
  - orderType, orderCompany
  - lines[]: New lines to add, each with itemNumber and quantity (at minimum)

Returns: Orchestration response confirming lines added.`,
      inputSchema: JdeAddPurchaseOrderLineSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: JdeAddPurchaseOrderLineInput) => {
      try {
        const { orchestrationName, inputs } = await buildOrchestrationPayload(
          "addPurchaseOrderLines",
          params as unknown as Record<string, unknown>
        );
        const result = await callOrchestration(orchestrationName, inputs);
        return orchResult(result);
      } catch (err) {
        return orchError("jde_add_purchase_order_line", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// CANCEL / DELETE — Purchase Order or Line
// ══════════════════════════════════════════════════════════════

export function registerCancelPurchaseOrder(server: McpServer): void {
  server.registerTool(
    "jde_cancel_purchase_order",
    {
      title: "Cancel JDE Purchase Order or Line",
      description: `Cancel an entire purchase order or a specific line in JDE via orchestration.

If lineNumber is provided, only that line is cancelled.
If lineNumber is omitted, the ENTIRE PO is cancelled.

⚠️ This is a DESTRUCTIVE operation. Always confirm with the user.

Args:
  - orderNumber (required): DOCO
  - orderType, orderCompany
  - lineNumber: Specific line to cancel (LNID). Omit to cancel entire order.
  - cancelReason: Optional reason code

Returns: Orchestration response confirming cancellation.`,
      inputSchema: JdeCancelPurchaseOrderSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (params: JdeCancelPurchaseOrderInput) => {
      try {
        const { orchestrationName, inputs } = await buildOrchestrationPayload(
          "cancelPurchaseOrder",
          params as unknown as Record<string, unknown>
        );
        const result = await callOrchestration(orchestrationName, inputs);
        return orchResult(result);
      } catch (err) {
        return orchError("jde_cancel_purchase_order", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// SUPPORTING — Supplier Lookup
// ══════════════════════════════════════════════════════════════

export function registerSupplierLookup(server: McpServer): void {
  server.registerTool(
    "jde_supplier_lookup",
    {
      title: "Look Up JDE Supplier",
      description: `Search the JDE Address Book (F0101) for suppliers (AT1='V').

Use this to find a supplier's AN8 before creating a purchase order, or to verify supplier details.

Args:
  - supplierNumber: Exact AN8 lookup
  - name: Partial name search
  - maxRows (default 20)`,
      inputSchema: JdeSupplierLookupSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: JdeSupplierLookupInput) => {
      try {
        const filters: FilterDef[] = [];
        addFilter(filters, "AN8", "EQUAL", params.supplierNumber);
        filters.push({ column: "AT1", operator: "EQUAL", value: "V" });
        if (params.name) {
          filters.push({ column: "ALPH", operator: "STR_CONTAIN", value: params.name });
        }

        const resp = await queryTable({
          tableName: "F0101",
          columns: ["AN8", "ALPH", "DC", "AT1", "ADD1", "CTY1", "ADDS", "CTR"],
          filters,
          maxRows: params.maxRows,
        });

        const grid = resp.fs_DATABROWSE?.data?.gridData;
        if (!grid || grid.rowset.length === 0) {
          return { content: [{ type: "text" as const, text: "No suppliers found." }] };
        }
        return formatQueryResult("Supplier Lookup (F0101)", "F0101", grid);
      } catch (err) {
        return orchError("jde_supplier_lookup", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// SUPPORTING — Item / Availability Check
// ══════════════════════════════════════════════════════════════

export function registerItemCheck(server: McpServer): void {
  server.registerTool(
    "jde_item_check",
    {
      title: "Check JDE Item & Availability",
      description: `Look up an item in JDE and check on-hand availability by branch (F41021).

Use before adding a line to a purchase order to verify the item exists and check current stock levels.

Args:
  - itemNumber: LITM (full or partial)
  - branchPlant: MCU to check (omit for all branches)
  - maxRows (default 20)`,
      inputSchema: JdeItemCheckSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: JdeItemCheckInput) => {
      try {
        const filters: FilterDef[] = [];
        if (params.itemNumber) {
          filters.push({ column: "LITM", operator: "STR_CONTAIN", value: params.itemNumber });
        }
        addFilter(filters, "MCU", "EQUAL", params.branchPlant);

        const resp = await queryTable({
          tableName: "F41021",
          columns: ["ITM", "LITM", "MCU", "OPC"],
          filters,
          maxRows: params.maxRows,
        });

        const grid = resp.fs_DATABROWSE?.data?.gridData;
        if (!grid || grid.rowset.length === 0) {
          return { content: [{ type: "text" as const, text: "No items found matching the criteria." }] };
        }
        return formatQueryResult("Item Availability (F41021)", "F41021", grid);
      } catch (err) {
        return orchError("jde_item_check", err);
      }
    }
  );
}
