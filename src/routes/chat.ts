import { Router, type Request, type Response } from "express";

const router = Router();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ──────────────────────────────────────────────────────────────
// POST /api/chat — Claude LLM proxy for AI chat assistant
// ──────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "Chat not configured",
      message:
        "Set ANTHROPIC_API_KEY environment variable to enable the AI assistant.",
    });
    return;
  }

  const { message, history = [] } = req.body as {
    message: string;
    history: ChatMessage[];
  };

  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  try {
    const messages = [
      ...history.map((m: ChatMessage) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are a JD Edwards EnterpriseOne Purchase Order assistant embedded in a procurement dashboard. Help users understand their PO data, approval workflows, supplier management, and procurement best practices. Be concise and professional. When referencing PO numbers, statuses, or amounts, format them clearly.`,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);
      res
        .status(502)
        .json({ error: "AI service error", details: errorText });
      return;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text =
      data.content.find((c) => c.type === "text")?.text ?? "";

    res.json({ role: "assistant", content: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat error:", msg);
    res.status(500).json({ error: "Chat request failed", details: msg });
  }
});

export default router;
