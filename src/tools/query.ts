import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  JdeQueryTableSchema,
  type JdeQueryTableInput,
} from "../schemas/tools.js";
import { queryTable } from "../services/ais-client.js";
import { resolveColumns } from "../services/dictionary.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerQueryTool(server: McpServer): void {
  server.registerTool(
    "jde_query_table",
    {
      title: "Query JDE Table",
      description: `Execute a read-only query against any JDE EnterpriseOne table via the AIS Data Service.

IMPORTANT: Before calling this tool, use jde_dictionary_search or jde_dictionary_table to discover valid table names and column aliases. JDE uses cryptic aliases (e.g. DOCO = Order Number, AN8 = Address Number) — guessing will fail.

This is a generic, flexible query tool. For common lookups, prefer the curated tools:
  - jde_purchase_order_inquiry → Purchase order detail/header
  - jde_supplier_lookup        → Address book / supplier search
  - jde_item_check             → Item branch on-hand

Args:
  - tableName (string): JDE table name (e.g. "F4311")
  - columns (string[]): JDE column aliases to return (e.g. ["DOCO","AN8","LITM","UORG"])
  - filters (array, optional): Filter conditions, each with column, operator, value
  - maxRows (number): Max rows to return (default 50, max 500)

Filter operators: EQUAL, NOT_EQUAL, LESS, LESS_EQUAL, GREATER, GREATER_EQUAL, BETWEEN, LIST, STR_CONTAIN, STR_START_WITH, STR_END_WITH, STR_BLANK, STR_NOT_BLANK

Returns:
  JSON with rows array and metadata (totalRecords, returnedRecords, hasMore).`,
      inputSchema: JdeQueryTableSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: JdeQueryTableInput) => {
      try {
        const { valid, invalid } = await resolveColumns(
          params.tableName,
          params.columns
        );

        let warning = "";
        if (invalid.length > 0) {
          warning =
            `⚠️ Unrecognized columns for ${params.tableName}: ${invalid.join(", ")}. ` +
            `They may still work if they exist in JDE but are not in the curated dictionary.\n\n`;
        }

        const response = await queryTable({
          tableName: params.tableName,
          columns: params.columns,
          filters: params.filters?.map((f) => ({
            column: f.column,
            operator: f.operator,
            value: f.value,
          })),
          maxRows: params.maxRows,
        });

        const gridData = response.fs_DATABROWSE?.data?.gridData;
        if (!gridData) {
          return {
            content: [{
              type: "text" as const,
              text: warning + "No data returned from AIS. The table may be empty or filters too restrictive.",
            }],
          };
        }

        const output = {
          tableName: params.tableName,
          totalRecords: gridData.summary.records,
          returnedRecords: gridData.rowset.length,
          hasMore: gridData.summary.moreRecords,
          rows: gridData.rowset,
        };

        let text = warning + JSON.stringify(output, null, 2);

        if (text.length > CHARACTER_LIMIT) {
          text = text.slice(0, CHARACTER_LIMIT) +
            `\n\n... [TRUNCATED — ${gridData.summary.records} total records. Narrow your filters or reduce maxRows.]`;
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error querying ${params.tableName}: ${msg}. ` +
              `Verify the table name and column aliases using jde_dictionary_search.`,
          }],
        };
      }
    }
  );
}
