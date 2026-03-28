import crypto from "crypto";

const COOKIE_NAME = "aria_session";
const COOKIE_MAX_AGE = 60 * 60 * 2;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

function deriveKey() {
  const secret = process.env.COOKIE_SECRET;
  if (!secret || secret.length < 32) throw new Error("COOKIE_SECRET manquant ou trop court");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSession(session) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export default function handler(req, res) {
  const origin = ALLOWED_ORIGIN || req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const freshSession = { patience: 100, messageCount: 0, history: [] };
    const token = encryptSession(freshSession);
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE}`
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[reset] Erreur:", err.message);
    return res.status(500).json({ ok: false });
  }
}
