import { Router, type Request, type Response } from "express";
import {
  isFoundryConfigured,
  chat as foundryChat,
} from "../services/foundry-agent.js";

const router = Router();

// ──────────────────────────────────────────────────────────────
// POST /api/chat — Foundry Agent chat (with MCP tools)
//
// The agent keeps multi-turn context via Foundry threads, keyed
// by the JDE session token that Express auth middleware injects.
// ──────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response): Promise<void> => {
  if (!isFoundryConfigured()) {
    res.status(503).json({
      error: "Chat not configured",
      message:
        "Set AZURE_AI_PROJECT_ENDPOINT and FOUNDRY_AGENT_NAME to enable the AI assistant.",
    });
    return;
  }

  const { message } = req.body as { message: string };

  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  // Use the JDE session token as the thread key so each logged-in
  // user gets their own conversation context.
  const sessionKey =
    (req as any).jdeToken ?? req.headers.authorization ?? "default";

  try {
    const reply = await foundryChat(sessionKey, message);
    res.json(reply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat error:", msg);
    res.status(500).json({ error: "Chat request failed", details: msg });
  }
});

export default router;
