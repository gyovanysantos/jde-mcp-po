// ──────────────────────────────────────────────────────────────
// foundry-agent/setup.ts
// Provisions a Foundry Prompt Agent with MCP tool pointing
// to the deployed JDE MCP server on Azure Container Apps.
//
// Usage:  npx tsx foundry-agent/setup.ts
// ──────────────────────────────────────────────────────────────

import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";

// ── Config ───────────────────────────────────────────────────
const PROJECT_ENDPOINT =
  process.env.AZURE_AI_PROJECT_ENDPOINT ??
  "https://gsantos-hackaton26-resource.services.ai.azure.com/api/projects/gsantos-hackaton26";

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ??
  "https://jde-mcp-po.bluedesert-fb732cac.eastus.azurecontainerapps.io/mcp";

const MODEL = process.env.FOUNDRY_MODEL ?? "gpt-4.1";
const AGENT_NAME = "jde-po-agent";

// ── System instructions for the agent ────────────────────────
const INSTRUCTIONS = `You are a JD Edwards EnterpriseOne Purchase Order assistant.
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

async function main() {
  console.log("🔧 Creating Foundry Agent...");
  console.log(`   Project:  ${PROJECT_ENDPOINT}`);
  console.log(`   Model:    ${MODEL}`);
  console.log(`   MCP URL:  ${MCP_SERVER_URL}`);
  console.log();

  const client = new AIProjectClient(
    PROJECT_ENDPOINT,
    new DefaultAzureCredential(),
  );

  // Create the agent with MCP tool — name is also the ID for invocation
  const agent = await client.agents.create(AGENT_NAME, {
    kind: "prompt",
    model: MODEL,
    instructions: INSTRUCTIONS,
    tools: [
      {
        type: "mcp",
        server_label: "jde-mcp-po",
        server_url: MCP_SERVER_URL,
        require_approval: "never",
      } as any,
    ],
  });

  console.log("✅ Agent created successfully!");
  console.log(`   Agent ID:   ${agent.id}`);
  console.log(`   Agent Name: ${agent.name}`);
  console.log();
  console.log("📋 Add this to your .env file:");
  console.log(`   FOUNDRY_AGENT_NAME=${agent.name}`);
}

main().catch((err) => {
  console.error("❌ Failed to create agent:", err.message ?? err);
  process.exit(1);
});
