// ──────────────────────────────────────────────────────────────
// services/foundry-agent.ts
// Wraps the Azure AI Foundry Responses API to provide a
// "send message → get reply" interface used by the chat route.
//
// Auth strategy (in priority order):
//   1. AZURE_AI_API_KEY  → plain OpenAI client + API key
//      (used inside the Container App where managed-identity
//       RBAC cannot be assigned on a shared subscription)
//   2. DefaultAzureCredential → AIProjectClient helper
//      (used during local dev where `az login` is available)
//
// How it works:
//   - We call openai.responses.create() using the deployed
//     model (e.g. gpt-4.1) with the MCP tool inline.
//   - Multi-turn context is kept via the Responses API's
//     previous_response_id chaining.
// ──────────────────────────────────────────────────────────────

import OpenAI from "openai";

// ── Initialisation ───────────────────────────────────────────

const endpoint = process.env.AZURE_AI_PROJECT_ENDPOINT ?? "";
const apiKey = process.env.AZURE_AI_API_KEY ?? "";
const model = process.env.FOUNDRY_MODEL ?? "gpt-4.1";
const mcpServerUrl =
  process.env.MCP_SERVER_URL ??
  "https://jde-mcp-po.bluedesert-fb732cac.eastus.azurecontainerapps.io/mcp";

const API_VERSION = "2025-11-15-preview";

const SYSTEM_INSTRUCTIONS = `You are a JD Edwards EnterpriseOne Purchase Order assistant.
You have access to a set of MCP tools that let you query, create, update, approve,
and manage purchase orders in JDE. You can also look up suppliers, items, and
data dictionary definitions.

Guidelines:
- Always confirm destructive actions (cancel, reject) before executing.
- When showing PO data, format order numbers, amounts (with currency), and dates clearly.
- If a query returns many results, summarise the key metrics before listing details.
- For approvals, always show the order amount and supplier before approving.
- Be concise and professional. Use short paragraphs — no walls of text.
- If an MCP tool call fails, explain the error in plain language and suggest next steps.`;

let oaiClient: OpenAI | undefined;

async function getOpenAIClient(): Promise<OpenAI> {
  if (oaiClient) return oaiClient;
  if (!endpoint) throw new Error("AZURE_AI_PROJECT_ENDPOINT is not set");

  if (apiKey) {
    // API-key auth (container / CI)
    oaiClient = new OpenAI({
      baseURL: endpoint + "/openai",
      apiKey,
      defaultQuery: { "api-version": API_VERSION },
    });
  } else {
    // DefaultAzureCredential (local dev via az login)
    const { AIProjectClient } = await import("@azure/ai-projects");
    const { DefaultAzureCredential } = await import("@azure/identity");
    const projClient = new AIProjectClient(
      endpoint,
      new DefaultAzureCredential(),
    );
    oaiClient = projClient.getOpenAIClient() as unknown as OpenAI;
  }
  return oaiClient;
}

/** Check whether the Foundry agent integration is configured */
export function isFoundryConfigured(): boolean {
  return !!endpoint;
}

// ── Conversation state (keyed by JDE session token) ──────────
const lastResponseId = new Map<string, string>();

// ── Public API ───────────────────────────────────────────────

export interface FoundryChatResult {
  role: "assistant";
  content: string;
}

/**
 * Send a user message to the Foundry agent and return the
 * assistant reply.  `sessionKey` ties messages to the same
 * conversation via previous_response_id chaining.
 */
export async function chat(
  sessionKey: string,
  userMessage: string,
): Promise<FoundryChatResult> {
  const oai = await getOpenAIClient();

  const prevId = lastResponseId.get(sessionKey);

  const response = await oai.responses.create({
    model,
    instructions: SYSTEM_INSTRUCTIONS,
    input: userMessage,
    tools: [
      {
        type: "mcp",
        server_label: "jde-mcp-po",
        server_url: mcpServerUrl,
        require_approval: "never",
      } as any,
    ],
    ...(prevId ? { previous_response_id: prevId } : {}),
  });

  // Cache the response ID for the next turn
  lastResponseId.set(sessionKey, response.id);

  // Extract text from output items
  const text = response.output
    .filter((item: any) => item.type === "message")
    .flatMap((item: any) => item.content ?? [])
    .filter((part: any) => part.type === "output_text")
    .map((part: any) => part.text ?? "")
    .join("\n")
    .trim();

  return { role: "assistant", content: text || "(empty reply)" };
}

/** Clear conversation state (e.g. on logout) */
export function clearThread(sessionKey: string): void {
  lastResponseId.delete(sessionKey);
}
