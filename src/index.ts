import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// REST API routes
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import purchaseOrderRoutes from "./routes/purchase-orders.js";
import chatRoutes from "./routes/chat.js";
import { requireAuth } from "./middleware/auth.js";

// Tool registrations — Dynamic Discovery layer (Layer 0)
import { registerDiscoverTable, registerSearchTables } from "./tools/discovery.js";

// Tool registrations — Dictionary layer
import { registerDictionaryTools } from "./tools/dictionary.js";

// Tool registrations — Generic query layer
import { registerQueryTool } from "./tools/query.js";

// Tool registrations — PO CRUD + supporting tools
import {
  registerPurchaseOrderInquiry,
  registerCreatePurchaseOrder,
  registerUpdatePurchaseOrder,
  registerAddPurchaseOrderLine,
  registerCancelPurchaseOrder,
  registerSupplierLookup,
  registerItemCheck,
} from "./tools/domain.js";

// Tool registrations — Generic orchestration (escape hatch)
import { registerOrchestrationTool } from "./tools/orchestration.js";

// Tool registrations — PO Approval workflow
import {
  registerPendingApprovals,
  registerApprovalDetails,
  registerApprovePurchaseOrder,
  registerRejectPurchaseOrder,
} from "./tools/approval.js";

// Services
import { loadDictionary } from "./services/dictionary.js";
import { logout } from "./services/ais-client.js";

// ──────────────────────────────────────────────────────────────
// Server Setup
// ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "jde-mcp-po-server",
  version: "1.0.0",
});

// ── Layer 0: Dynamic Discovery (live from JDE) ───────────────
registerDiscoverTable(server);           // jde_discover_table
registerSearchTables(server);            // jde_search_tables

// ── Layer 1: Data Dictionary ──────────────────────────────────
registerDictionaryTools(server);         // jde_dictionary_search, _list, _table

// ── Layer 2: PO CRUD (curated, business-friendly) ─────────────
registerPurchaseOrderInquiry(server);    // READ   — jde_purchase_order_inquiry
registerCreatePurchaseOrder(server);     // CREATE — jde_create_purchase_order
registerUpdatePurchaseOrder(server);     // UPDATE — jde_update_purchase_order
registerAddPurchaseOrderLine(server);    // ADD    — jde_add_purchase_order_line
registerCancelPurchaseOrder(server);     // DELETE — jde_cancel_purchase_order

// ── Layer 3: Supporting lookups ───────────────────────────────
registerSupplierLookup(server);          // jde_supplier_lookup
registerItemCheck(server);               // jde_item_check

// ── Layer 4: PO Approval workflow ─────────────────────────────
registerPendingApprovals(server);        // jde_pending_approvals
registerApprovalDetails(server);         // jde_approval_details
registerApprovePurchaseOrder(server);    // jde_approve_purchase_order
registerRejectPurchaseOrder(server);     // jde_reject_purchase_order

// ── Layer 5: Generic (fallback) ───────────────────────────────
registerQueryTool(server);               // jde_query_table
registerOrchestrationTool(server);       // jde_call_orchestration

// ──────────────────────────────────────────────────────────────
// Transport
// ──────────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  await loadDictionary();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jde-mcp-po-server v1.0.0 running on stdio — Purchase Order CRUD ready");

  process.on("SIGINT", async () => { await logout(); process.exit(0); });
  process.on("SIGTERM", async () => { await logout(); process.exit(0); });
}

async function runHTTP(): Promise<void> {
  await loadDictionary();

  const app = express();

  // CORS — allow Vite dev server during development
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  }));

  app.use(express.json());

  // ── MCP endpoint (no web auth — uses its own transport) ─────
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "jde-mcp-po-server", version: "1.0.0" });
  });

  // ── Public auth routes ──────────────────────────────────────
  app.use("/api/auth", authRoutes);

  // ── Protected REST API routes ───────────────────────────────
  app.use("/api/dashboard", requireAuth, dashboardRoutes);
  app.use("/api/purchase-orders", requireAuth, purchaseOrderRoutes);
  app.use("/api/chat", requireAuth, chatRoutes);

  // ── Serve frontend static files (production) ───────────────
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = process.env.FRONTEND_DIR || path.join(__dirname, "../frontend/dist");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // SPA fallback — serve index.html for non-API routes
    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`jde-mcp-po-server v1.0.0 running on http://localhost:${port}`);
    console.error(`  MCP endpoint: POST /mcp`);
    console.error(`  REST API:     /api/*`);
    console.error(`  Health:       GET /health`);
    if (fs.existsSync(frontendDist)) {
      console.error(`  Frontend:     serving from ${frontendDist}`);
    }
  });
}

const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  runHTTP().catch((err) => { console.error("Server error:", err); process.exit(1); });
} else {
  runStdio().catch((err) => { console.error("Server error:", err); process.exit(1); });
}
