import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  JdePendingApprovalsSchema,
  JdeApprovalDetailsSchema,
  JdeApprovePurchaseOrderSchema,
  JdeRejectPurchaseOrderSchema,
  type JdePendingApprovalsInput,
  type JdeApprovalDetailsInput,
  type JdeApprovePurchaseOrderInput,
  type JdeRejectPurchaseOrderInput,
} from "../schemas/tools.js";
import { callOrchestration } from "../services/ais-client.js";
import { buildOrchestrationPayload } from "../services/orch-mapper.js";
import { CHARACTER_LIMIT } from "../constants.js";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + "\n\n... [TRUNCATED]";
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
// READ — List POs Pending Approval
// ══════════════════════════════════════════════════════════════

export function registerPendingApprovals(server: McpServer): void {
  server.registerTool(
    "jde_pending_approvals",
    {
      title: "List POs Pending Approval",
      description: `List all purchase orders pending approval for the authenticated user.

This calls the "poApprovals" orchestration, which returns POs in the current user's approval queue. No input filters are needed — the approval queue is determined by the authenticated JDE user.

Each PO in the list includes:
  - orderNumber, orderType, orderCompany
  - supplierNumber, supplierName
  - orderAmount, orderDate, orderRequestDate
  - holdCode, branchPlant

Use jde_approval_details to drill into a specific PO's lines before approving or rejecting.

Args:
  - maxRows (default 50): Max POs to return`,
      inputSchema: JdePendingApprovalsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (_params: JdePendingApprovalsInput) => {
      try {
        const { orchestrationName } = await buildOrchestrationPayload(
          "pendingApprovals",
          {}
        );
        const result = await callOrchestration(orchestrationName, {});
        return orchResult(result);
      } catch (err) {
        return orchError("jde_pending_approvals", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// READ — PO Approval Details (lines for a specific PO)
// ══════════════════════════════════════════════════════════════

export function registerApprovalDetails(server: McpServer): void {
  server.registerTool(
    "jde_approval_details",
    {
      title: "Get PO Approval Details",
      description: `Get the detail lines for a specific purchase order pending approval.

Use this to review line-level information (items, quantities, amounts) before approving or rejecting a PO. Typically called after jde_pending_approvals identifies a PO to review.

Returns an array of lines, each with:
  - lineNumber, itemNumber, itemDescription
  - quantity, amount, orderDate

Args:
  - orderNumber (required): PO document number
  - orderType (default "OP")
  - orderCompany (default "00001")`,
      inputSchema: JdeApprovalDetailsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: JdeApprovalDetailsInput) => {
      try {
        const { orchestrationName, inputs } = await buildOrchestrationPayload(
          "approvalDetails",
          params as unknown as Record<string, unknown>
        );
        const result = await callOrchestration(orchestrationName, inputs);
        return orchResult(result);
      } catch (err) {
        return orchError("jde_approval_details", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// ACTION — Approve Purchase Order
// ══════════════════════════════════════════════════════════════

export function registerApprovePurchaseOrder(server: McpServer): void {
  server.registerTool(
    "jde_approve_purchase_order",
    {
      title: "Approve JDE Purchase Order",
      description: `Approve a purchase order in JDE via the approvePOMobile orchestration (P43081).

The authenticated user is recorded as the approver. The orchestration handles the full approval workflow within JDE.

⚠️ This APPROVES a PO in JDE. Confirm with the user before calling.

Args:
  - orderNumber (required): PO document number to approve

Returns: Orchestration response with orderNumber and confirmation message.`,
      inputSchema: JdeApprovePurchaseOrderSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: JdeApprovePurchaseOrderInput) => {
      try {
        const { orchestrationName, inputs } = await buildOrchestrationPayload(
          "approvePurchaseOrder",
          params as unknown as Record<string, unknown>
        );
        const result = await callOrchestration(orchestrationName, inputs);
        return orchResult(result);
      } catch (err) {
        return orchError("jde_approve_purchase_order", err);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// ACTION — Reject Purchase Order
// ══════════════════════════════════════════════════════════════

export function registerRejectPurchaseOrder(server: McpServer): void {
  server.registerTool(
    "jde_reject_purchase_order",
    {
      title: "Reject JDE Purchase Order",
      description: `Reject a purchase order in JDE via the rejectPOMobile orchestration (P43081).

The authenticated user is recorded as the rejector. Optionally provide a remark explaining the rejection reason.

⚠️ This REJECTS a PO in JDE. Confirm with the user before calling.

Args:
  - orderNumber (required): PO document number to reject
  - remark (optional): Reason for rejection
  - P43081_Version (optional): Version override for P43081

Returns: Orchestration response with orderNumber and confirmation message.`,
      inputSchema: JdeRejectPurchaseOrderSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (params: JdeRejectPurchaseOrderInput) => {
      try {
        const { orchestrationName, inputs } = await buildOrchestrationPayload(
          "rejectPurchaseOrder",
          params as unknown as Record<string, unknown>
        );
        const result = await callOrchestration(orchestrationName, inputs);
        return orchResult(result);
      } catch (err) {
        return orchError("jde_reject_purchase_order", err);
      }
    }
  );
}
