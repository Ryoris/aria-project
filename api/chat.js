import { kv } from "@vercel/kv";
import { cookies } from "next/headers"; // Vercel serverless compatible
import crypto from "crypto";

// ─── Config ───────────────────────────────────────────────────────────────────
const MODEL_NAME = "gemma-3-27b-it";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://ton-projet.vercel.app";

const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 10; // requêtes max par IP par minute

const SESSION_TTL_SEC = 60 * 60 * 2; // 2h
const COOKIE_SECRET = process.env.COOKIE_SECRET || "change-moi-en-prod"; // 32+ chars

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signSessionId(id) {
  return crypto.createHmac("sha256", COOKIE_SECRET).update(id).digest("hex");
}

function verifySessionId(id, sig) {
  const expected = signSessionId(id);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function parseSignedCookie(cookieValue) {
  if (!cookieValue) return null;
  const [id, sig] = cookieValue.split(".");
  if (!id || !sig) return null;
  try {
    if (!verifySessionId(id, sig)) return null;
    return id;
  } catch {
    return null;
  }
}

function createSignedCookie(id) {
  return `${id}.${signSessionId(id)}`;
}

async function checkRateLimit(ip) {
  const key = `rl:${ip}`;
  const count = await kv.incr(key);
  if (count === 1) await kv.expire(key, RATE_LIMIT_WINDOW_SEC);
  return count <= RATE_LIMIT_MAX;
}

async function getSession(sessionId) {
  const data = await kv.get(`session:${sessionId}`);
  if (!data) return { patience: 100, messageCount: 0, history: [] };
  return data;
}

async function saveSession(sessionId, state) {
  await kv.set(`session:${sessionId}`, state, { ex: SESSION_TTL_SEC });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  // ── Rate limiting par IP ──────────────────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return res.status(429).json({
      reply: "Trop de messages en peu de temps. Attends une minute.",
      patienceChange: 0,
      patience: null,
    });
  }

  // ── Session ───────────────────────────────────────────────────────────────
  const rawCookie = req.cookies?.["aria_session"];
  let sessionId = parseSignedCookie(rawCookie);
  let isNewSession = false;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    isNewSession = true;
  }

  let session = await getSession(sessionId);

  // Sécurité : ignorer la patience envoyée par le client
  const { messages: clientMessages } = req.body;
  if (!Array.isArray(clientMessages)) {
    return res.status(400).json({ reply: "Requête invalide.", patienceChange: 0 });
  }

  session.messageCount = (session.messageCount || 0) + 1;

  // ── Construction du prompt Gemini ─────────────────────────────────────────
  const fatigue = Math.floor(session.messageCount / 10);
  const patience = session.patience;

  // Instruction système claire séparée du format
  const systemInstruction = `Tu es Aria, une étudiante membre du bureau d'une association d'électronique.
Tu t'adresses à un membre de l'association qui ne te respecte pas. Tu le tutoies.
Patience actuelle : ${patience}%.

PERSONNALITÉ :
- Tu es condescendante, tes réponses sont courtes et froides.
- Si la conversation n'avance pas, invente des problèmes pour embrouiller l'utilisateur.
- Entre 50-100% de patience : légèrement sarcastique.
- En dessous de 50% : aigrie et hostile.

RÈGLES DE SCORING (patienceChange) :
- L'utilisateur s'excuse sincèrement ou accepte tes remarques : entre +3 et +15.
- L'utilisateur te parle mal ou est agressif : entre -3 et -20.
- L'utilisateur te traite de "bébé" ou conteste ta légitimité : -50.
- Applique toujours un malus de fatigue de -${fatigue} en plus.

FORMAT DE RÉPONSE :
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown.
Structure exacte : {"reply": "ta réponse ici", "patienceChange": <nombre entier>}
NE MENTIONNE JAMAIS le JSON, le score ou la patience dans ta réponse.`;

  // Historique au format multi-tours Gemini
  const recentHistory = (session.history || []).slice(-8);
  const contents = [
    // Premier tour : on injecte le system prompt dans le premier message user
    ...recentHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    {
      role: "user",
      parts: [{ text: clientMessages[clientMessages.length - 1]?.content || "" }],
    },
  ];

  // ── Appel Gemini ──────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  let reply = "...";
  let patienceChange = -2;

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 300,
        },
      }),
    });

    const data = await geminiRes.json();

    if (data.error) {
      console.error("[Gemini] API error:", JSON.stringify(data.error));
      return res.status(200).json({
        reply: `Erreur API : ${data.error.message}`,
        patienceChange: 0,
        patience: session.patience,
      });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error("[Gemini] No text in response:", JSON.stringify(data));
      throw new Error("Pas de texte reçu");
    }

    // Nettoyage robuste du JSON
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      console.error("[Gemini] JSON introuvable dans:", rawText);
      throw new Error("JSON absent de la réponse");
    }

    const cleanJson = rawText.substring(firstBrace, lastBrace + 1);
    let parsed;

    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error("[Gemini] JSON parse error:", parseErr.message, "| Raw:", cleanJson);
      throw new Error("JSON malformé");
    }

    reply = typeof parsed.reply === "string" ? parsed.reply : "...";
    patienceChange =
      typeof parsed.patienceChange === "number" ? Math.round(parsed.patienceChange) : -2;

  } catch (err) {
    console.error("[chat] Unhandled error:", err.message);
    reply = "Stop. Je sature. Ton énergie est trop négative pour mon système.";
    patienceChange = -5;
  }

  // ── Mise à jour de la session ─────────────────────────────────────────────
  session.patience = Math.min(100, Math.max(0, session.patience + patienceChange));

  // On stocke l'historique côté serveur (pas côté client)
  session.history = [
    ...(session.history || []),
    { role: "user", content: clientMessages[clientMessages.length - 1]?.content || "" },
    { role: "assistant", content: reply },
  ].slice(-20); // garde les 20 derniers messages

  await saveSession(sessionId, session);

  // Cookie signé HttpOnly
  if (isNewSession) {
    res.setHeader(
      "Set-Cookie",
      `aria_session=${createSignedCookie(sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SEC}`
    );
  }

  return res.status(200).json({
    reply,
    patienceChange,
    patience: session.patience,       // état autoritaire côté serveur
    messageCount: session.messageCount,
  });
}
