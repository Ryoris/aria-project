import { kv } from "@vercel/kv";
import crypto from "crypto";

const COOKIE_SECRET = process.env.COOKIE_SECRET || "change-moi-en-prod";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://ton-projet.vercel.app";
const SESSION_TTL_SEC = 60 * 60 * 2;

function signSessionId(id) {
  return crypto.createHmac("sha256", COOKIE_SECRET).update(id).digest("hex");
}

function createSignedCookie(id) {
  return `${id}.${signSessionId(id)}`;
}

function parseSignedCookie(cookieValue) {
  if (!cookieValue) return null;
  const [id, sig] = cookieValue.split(".");
  if (!id || !sig) return null;
  try {
    const expected = signSessionId(id);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return id;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  // Supprime l'ancienne session
  const rawCookie = req.cookies?.["aria_session"];
  const oldSessionId = parseSignedCookie(rawCookie);
  if (oldSessionId) {
    await kv.del(`session:${oldSessionId}`).catch(() => {});
  }

  // Crée une nouvelle session vierge
  const newSessionId = crypto.randomUUID();
  await kv.set(
    `session:${newSessionId}`,
    { patience: 100, messageCount: 0, history: [] },
    { ex: SESSION_TTL_SEC }
  );

  res.setHeader(
    "Set-Cookie",
    `aria_session=${createSignedCookie(newSessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SEC}`
  );

  return res.status(200).json({ ok: true });
}
