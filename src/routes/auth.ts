import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { AIS_BASE_URL, JDE_ENVIRONMENT, JDE_ROLE } from "../constants.js";

const router = Router();

// ──────────────────────────────────────────────────────────────
// In-memory session store
// ──────────────────────────────────────────────────────────────

interface SessionData {
  username: string;
  addressNumber: number;
  loginTime: number;
}

const sessions = new Map<string, SessionData>();

const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

export function getSession(token: string): SessionData | undefined {
  const session = sessions.get(token);
  if (!session) return undefined;
  if (Date.now() - session.loginTime > SESSION_TTL) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

// ──────────────────────────────────────────────────────────────
// POST /api/auth/login — Validate credentials against JDE AIS
// ──────────────────────────────────────────────────────────────

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  try {
    const url = new URL(`${AIS_BASE_URL}/v3/tokenrequest`);
    const payload = JSON.stringify({
      username,
      password,
      deviceName: "jde-mcp-po-web",
      environment: JDE_ENVIRONMENT,
      role: JDE_ROLE,
    });

    const transport = url.protocol === "https:" ? https : http;

    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const httpReq = transport.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (httpRes) => {
          const chunks: Buffer[] = [];
          httpRes.on("data", (c: Buffer) => chunks.push(c));
          httpRes.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8");
            if (!httpRes.statusCode || httpRes.statusCode >= 400) {
              reject(new Error(`AIS auth failed: ${httpRes.statusCode}`));
              return;
            }
            try {
              resolve(JSON.parse(text));
            } catch {
              reject(new Error("Invalid response from AIS"));
            }
          });
        }
      );
      httpReq.on("error", reject);
      httpReq.setTimeout(15_000, () =>
        httpReq.destroy(new Error("Auth request timeout"))
      );
      httpReq.write(payload);
      httpReq.end();
    });

    const token = crypto.randomBytes(32).toString("hex");
    const userInfo = result.userInfo as Record<string, unknown> | undefined;

    sessions.set(token, {
      username,
      addressNumber: Number(userInfo?.addressNumber ?? 0),
      loginTime: Date.now(),
    });

    res.json({
      token,
      username,
      addressNumber: Number(userInfo?.addressNumber ?? 0),
    });
  } catch {
    res.status(401).json({ error: "Invalid JDE credentials" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ──────────────────────────────────────────────────────────────

router.post("/logout", (req: Request, res: Response): void => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    sessions.delete(auth.slice(7));
  }
  res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/me — Return current user info
// ──────────────────────────────────────────────────────────────

router.get("/me", (req: Request, res: Response): void => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const session = getSession(auth.slice(7));
  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  res.json({
    username: session.username,
    addressNumber: session.addressNumber,
  });
});

export default router;
