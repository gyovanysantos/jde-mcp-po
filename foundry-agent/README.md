# JDE PO Foundry Agent

Azure AI Foundry **Responses API** integration that uses the JDE MCP server as a tool.

## Architecture

```
Frontend ChatPanel
      │
      ▼
  /api/chat  (Express backend)
      │
      ▼
  OpenAI Responses API (via Foundry endpoint)
      │  (gpt-4.1 + MCP tool inline)
      ▼
  JDE MCP Server (Azure Container Apps)
      │  (Streamable HTTP transport)
      ▼
  JDE AIS REST API
```

## How it works

The chat route calls the **OpenAI Responses API** through the Foundry
project endpoint with:
- `model: gpt-4.1` (deployed model)
- `instructions:` system prompt (inline)
- `tools: [{ type: "mcp", server_url: ... }]` pointing to the MCP server

Multi-turn context uses `previous_response_id` chaining — no thread
management needed.

## Auth strategy

| Environment | Auth method |
|---|---|
| Local dev | `DefaultAzureCredential` via `az login` (no API key needed) |
| Container App | `AZURE_AI_API_KEY` env var → plain OpenAI client |

## Setup

1. Deploy MCP server to Azure Container Apps (see root `Dockerfile`)
2. Optionally run `npx tsx foundry-agent/setup.ts` to register the agent definition in Foundry portal
3. Set env vars in `.env` (see below)
4. Restart backend — chat now uses Foundry Responses API

## Environment Variables

| Variable | Description |
|---|---|
| `AZURE_AI_PROJECT_ENDPOINT` | Foundry project endpoint |
| `AZURE_AI_API_KEY` | AI Services API key (optional locally, required in container) |
| `FOUNDRY_MODEL` | Model deployment name (default: `gpt-4.1`) |
| `MCP_SERVER_URL` | Deployed MCP server URL (`https://jde-mcp-po.bluedesert-fb732cac.eastus.azurecontainerapps.io/mcp`) |
