import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

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

// ── Layer 4: Generic (fallback) ───────────────────────────────
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
  app.use(express.json());

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

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`jde-mcp-po-server v1.0.0 running on http://localhost:${port}/mcp`);
  });
}

const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  runHTTP().catch((err) => { console.error("Server error:", err); process.exit(1); });
} else {
  runStdio().catch((err) => { console.error("Server error:", err); process.exit(1); });
}
