import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Shared
// ──────────────────────────────────────────────────────────────

const AisOperatorEnum = z.enum([
  "EQUAL", "NOT_EQUAL", "LESS", "LESS_EQUAL",
  "GREATER", "GREATER_EQUAL", "BETWEEN", "LIST",
  "STR_CONTAIN", "STR_START_WITH", "STR_END_WITH",
  "STR_BLANK", "STR_NOT_BLANK",
]).describe("AIS query operator");

const FilterSchema = z.object({
  column: z.string().describe("JDE column alias (e.g. DOCO, AN8, LITM)"),
  operator: AisOperatorEnum,
  value: z.union([z.string(), z.array(z.string())])
    .describe("Value(s) to filter on. Use array for LIST/BETWEEN operators"),
}).strict();

// ── PO Line (reused in create and update) ─────────────────────

const POLineSchema = z.object({
  itemNumber: z.string()
    .describe("Item number (LITM), e.g. 'ABC123'"),
  quantity: z.number()
    .positive()
    .describe("Quantity to order"),
  unitCost: z.number()
    .optional()
    .describe("Override unit cost. Omit to use JDE default cost."),
  lineType: z.string()
    .default("S")
    .describe("Line type: S=Stock (default), B=Bulk, N=Non-Stock, F=Freight"),
  requestedDate: z.string()
    .optional()
    .describe("Requested delivery date for this line (YYYY-MM-DD). Defaults to header date."),
  branchPlant: z.string()
    .optional()
    .describe("Branch/plant override for this line. Defaults to header branch."),
}).strict();

// ──────────────────────────────────────────────────────────────
// Data Dictionary Tools
// ──────────────────────────────────────────────────────────────

export const JdeDictionarySearchSchema = z.object({
  keyword: z.string()
    .min(1)
    .max(100)
    .describe("Search keyword — matches table names, descriptions, column names/aliases."),
}).strict();

export const JdeDictionaryListSchema = z.object({}).strict();

export const JdeDictionaryTableSchema = z.object({
  tableName: z.string().min(1).max(20)
    .describe("JDE table name (e.g. 'F4311', 'F0101')"),
}).strict();

// ──────────────────────────────────────────────────────────────
// Generic Query Tool
// ──────────────────────────────────────────────────────────────

export const JdeQueryTableSchema = z.object({
  tableName: z.string().min(1).max(20)
    .describe("JDE table name to query"),
  columns: z.array(z.string()).min(1).max(50)
    .describe("JDE column aliases to return"),
  filters: z.array(FilterSchema).optional()
    .describe("Optional filter conditions"),
  maxRows: z.number().int().min(1).max(500).default(50)
    .describe("Max rows to return (default 50)"),
}).strict();

// ──────────────────────────────────────────────────────────────
// READ — Purchase Order Inquiry
// ──────────────────────────────────────────────────────────────

export const JdePurchaseOrderInquirySchema = z.object({
  orderNumber: z.number().int().optional()
    .describe("Purchase order number (DOCO)"),
  supplierNumber: z.number().int().optional()
    .describe("Supplier address book number (AN8)"),
  supplierName: z.string().optional()
    .describe("Supplier name to search. If provided, the tool first resolves AN8 from F0101."),
  itemNumber: z.string().optional()
    .describe("Item number to filter by (LITM)"),
  branchPlant: z.string().optional()
    .describe("Branch/plant code (MCU)"),
  orderType: z.string().optional()
    .describe("Document type filter (e.g. 'OP', 'OB'). If omitted, returns ALL order types."),
  statusFrom: z.string().optional()
    .describe("Min next status (NXTR). E.g. '220' for open POs."),
  statusTo: z.string().optional()
    .describe("Max next status. Use '999' to include closed."),
  includeHeader: z.boolean().default(false)
    .describe("Also return the PO header (F4301) alongside detail lines."),
  maxRows: z.number().int().min(1).max(200).default(50)
    .describe("Max detail lines to return"),
}).strict();

// ──────────────────────────────────────────────────────────────
// CREATE — Purchase Order
// ──────────────────────────────────────────────────────────────

export const JdeCreatePurchaseOrderSchema = z.object({
  supplierNumber: z.number().int()
    .describe("Supplier address book number (AN8). Required."),
  shipToNumber: z.number().int().optional()
    .describe("Ship-to address book number (SHAN). Defaults to the receiving branch."),
  branchPlant: z.string()
    .describe("Default branch/plant for the order (MCU), e.g. 'M30'. Required."),
  orderType: z.string().default("OP")
    .describe("Document type (default 'OP' = Purchase Order)"),
  orderDate: z.string().optional()
    .describe("Order date (YYYY-MM-DD). Defaults to today."),
  requestedDate: z.string().optional()
    .describe("Requested delivery date (YYYY-MM-DD)."),
  supplierReference: z.string().optional()
    .describe("Supplier reference / quote number (VR01)."),
  lines: z.array(POLineSchema).min(1).max(100)
    .describe("PO detail lines. At least one line is required."),
}).strict();

// ──────────────────────────────────────────────────────────────
// UPDATE — Purchase Order Line
// ──────────────────────────────────────────────────────────────

export const JdeUpdatePurchaseOrderSchema = z.object({
  orderNumber: z.number().int()
    .describe("Purchase order number to update (DOCO). Required."),
  orderType: z.string().default("OP")
    .describe("Document type (default 'OP')"),
  orderCompany: z.string().default("00001")
    .describe("Order company (KCOO). Default '00001'."),
  lineNumber: z.number().int()
    .describe("Line number to update (LNID, e.g. 1000 = line 1). Required."),
  quantity: z.number().positive().optional()
    .describe("New quantity ordered. Omit to leave unchanged."),
  unitCost: z.number().optional()
    .describe("New unit cost override. Omit to leave unchanged."),
  requestedDate: z.string().optional()
    .describe("New requested date (YYYY-MM-DD). Omit to leave unchanged."),
  promisedDate: z.string().optional()
    .describe("New promised date (YYYY-MM-DD). Omit to leave unchanged."),
  branchPlant: z.string().optional()
    .describe("Change branch/plant for this line."),
}).strict();

// ──────────────────────────────────────────────────────────────
// ADD LINE — to existing Purchase Order
// ──────────────────────────────────────────────────────────────

export const JdeAddPurchaseOrderLineSchema = z.object({
  orderNumber: z.number().int()
    .describe("Existing purchase order number (DOCO) to add lines to. Required."),
  orderType: z.string().default("OP")
    .describe("Document type (default 'OP')"),
  orderCompany: z.string().default("00001")
    .describe("Order company (KCOO). Default '00001'."),
  lines: z.array(POLineSchema).min(1).max(50)
    .describe("New lines to add to the existing PO."),
}).strict();

// ──────────────────────────────────────────────────────────────
// DELETE / CANCEL — Purchase Order or Line
// ──────────────────────────────────────────────────────────────

export const JdeCancelPurchaseOrderSchema = z.object({
  orderNumber: z.number().int()
    .describe("Purchase order number to cancel (DOCO). Required."),
  orderType: z.string().default("OP")
    .describe("Document type (default 'OP')"),
  orderCompany: z.string().default("00001")
    .describe("Order company (KCOO). Default '00001'."),
  lineNumber: z.number().int().optional()
    .describe("Specific line to cancel (LNID, e.g. 1000). Omit to cancel the ENTIRE order."),
  cancelReason: z.string().optional()
    .describe("Reason code for cancellation, if your JDE setup requires one."),
}).strict();

// ──────────────────────────────────────────────────────────────
// SUPPORTING — Supplier Lookup & Item Check
// ──────────────────────────────────────────────────────────────

export const JdeSupplierLookupSchema = z.object({
  supplierNumber: z.number().int().optional()
    .describe("Exact address book number (AN8)"),
  name: z.string().optional()
    .describe("Full or partial supplier name to search (ALPH)"),
  maxRows: z.number().int().min(1).max(100).default(20)
    .describe("Max results"),
}).strict();

export const JdeItemCheckSchema = z.object({
  itemNumber: z.string().optional()
    .describe("Item number (LITM) — full or partial"),
  branchPlant: z.string().optional()
    .describe("Branch/plant to check availability at (MCU)"),
  maxRows: z.number().int().min(1).max(100).default(20)
    .describe("Max results"),
}).strict();

// ──────────────────────────────────────────────────────────────
// Generic Orchestration (escape hatch)
// ──────────────────────────────────────────────────────────────

export const JdeCallOrchestrationSchema = z.object({
  orchestrationName: z.string().min(1).max(200)
    .describe("Name of the JDE orchestration to invoke"),
  inputs: z.record(z.unknown())
    .describe("Key-value inputs for the orchestration"),
}).strict();

// ──────────────────────────────────────────────────────────────
// Layer 0 — Dynamic Discovery Tools
// ──────────────────────────────────────────────────────────────

export const JdeDiscoverTableSchema = z.object({
  tableName: z.string().min(1).max(20)
    .describe("JDE table name to discover (e.g. 'F4311', 'F0101'). Queries F9210 for structure and F9200 for column descriptions."),
}).strict();

export const JdeSearchTablesSchema = z.object({
  keyword: z.string().min(1).max(100)
    .describe("Search keyword to find JDE tables by name or description. Queries F0092 (Object Librarian)."),
  maxRows: z.number().int().min(1).max(100).default(20)
    .describe("Max tables to return (default 20)"),
}).strict();

// ──────────────────────────────────────────────────────────────
// Inferred types
// ──────────────────────────────────────────────────────────────

export type JdeDictionarySearchInput = z.infer<typeof JdeDictionarySearchSchema>;
export type JdeQueryTableInput = z.infer<typeof JdeQueryTableSchema>;
export type JdePurchaseOrderInquiryInput = z.infer<typeof JdePurchaseOrderInquirySchema>;
export type JdeCreatePurchaseOrderInput = z.infer<typeof JdeCreatePurchaseOrderSchema>;
export type JdeUpdatePurchaseOrderInput = z.infer<typeof JdeUpdatePurchaseOrderSchema>;
export type JdeAddPurchaseOrderLineInput = z.infer<typeof JdeAddPurchaseOrderLineSchema>;
export type JdeCancelPurchaseOrderInput = z.infer<typeof JdeCancelPurchaseOrderSchema>;
export type JdeSupplierLookupInput = z.infer<typeof JdeSupplierLookupSchema>;
export type JdeItemCheckInput = z.infer<typeof JdeItemCheckSchema>;
export type JdeCallOrchestrationInput = z.infer<typeof JdeCallOrchestrationSchema>;
export type JdeDiscoverTableInput = z.infer<typeof JdeDiscoverTableSchema>;
export type JdeSearchTablesInput = z.infer<typeof JdeSearchTablesSchema>;
