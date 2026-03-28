import crypto from "crypto";

// ─── Config ───────────────────────────────────────────────────────────────────
const MODEL_NAME = "gemma-3-27b-it";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

// Rate limiting en mémoire (par instance serverless — suffisant pour un petit jeu)
const rateLimitMap = new Map(); // ip -> { count, resetAt }

const COOKIE_NAME = "aria_session";
const COOKIE_MAX_AGE = 60 * 60 * 2; // 2h
const SESSION_MAX_HISTORY = 20;

// ─── Chiffrement AES-256-GCM ──────────────────────────────────────────────────

function deriveKey() {
  const secret = process.env.COOKIE_SECRET;
  if (!secret || secret.length < 32) throw new Error("COOKIE_SECRET manquant ou trop court (32+ chars requis)");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSession(session) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(session);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format : iv(12) + tag(16) + ciphertext → base64url
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptSession(token) {
  try {
    const key = deriveKey();
    const buf = Buffer.from(token, "base64url");
    if (buf.length < 29) throw new Error("Token trop court");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const raw = decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
    const parsed = JSON.parse(raw);

    // Validation de structure
    if (
      typeof parsed.patience !== "number" ||
      typeof parsed.messageCount !== "number" ||
      !Array.isArray(parsed.history)
    ) throw new Error("Structure invalide");

    // Borne de sécurité : le client ne peut pas gonfler sa patience
    parsed.patience = Math.min(100, Math.max(0, parsed.patience));
    return parsed;
  } catch (err) {
    console.warn("[session] Cookie invalide ou falsifié:", err.message);
    return null;
  }
}

function defaultSession() {
  return { patience: 100, messageCount: 0, history: [] };
}

function buildSetCookie(token, maxAge = COOKIE_MAX_AGE) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS — restreint au domaine configuré
  const origin = ALLOWED_ORIGIN || req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origin);
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

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      reply: "Trop de messages en peu de temps. Attends une minute.",
      patienceChange: 0,
      patience: null,
    });
  }

  // ── Lecture de la session depuis le cookie chiffré ────────────────────────
  const rawCookie = req.cookies?.[COOKIE_NAME];
  let session = rawCookie ? decryptSession(rawCookie) : null;
  if (!session) session = defaultSession();

  // ── Validation du body ────────────────────────────────────────────────────
  const { messages: clientMessages } = req.body || {};
  if (!Array.isArray(clientMessages) || clientMessages.length === 0) {
    return res.status(400).json({ reply: "Requête invalide.", patienceChange: 0 });
  }
  const userText = (clientMessages[clientMessages.length - 1]?.content || "").trim();
  if (!userText) {
    return res.status(400).json({ reply: "Message vide.", patienceChange: 0 });
  }

  session.messageCount++;

  // ── Prompt Gemini ─────────────────────────────────────────────────────────
  const fatigue = Math.floor(session.messageCount / 10);

  const systemInstruction = `Tu es Aria, une étudiante membre du bureau d'une association d'électronique.
Tu t'adresses à un membre de l'association qui ne te respecte pas. Tu le tutoies.
Patience actuelle : ${session.patience}%.

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

  // Historique multi-tours (8 derniers messages)
  const contents = [
    ...session.history.slice(-8).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userText }] },
  ];

  // ── Appel Gemini ──────────────────────────────────────────────────────────
  let reply = "...";
  let patienceChange = -2;

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.8, maxOutputTokens: 300 },
      }),
    });

    const data = await geminiRes.json();

    if (data.error) {
      console.error("[Gemini] Erreur API:", JSON.stringify(data.error));
      return res.status(200).json({
        reply: `Erreur API : ${data.error.message}`,
        patienceChange: 0,
        patience: session.patience,
      });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      console.error("[Gemini] Pas de texte reçu:", JSON.stringify(data));
      throw new Error("Pas de texte reçu");
    }

    // Extraction robuste du JSON
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      console.error("[Gemini] JSON introuvable dans:", rawText);
      throw new Error("JSON absent de la réponse");
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
    } catch (parseErr) {
      console.error("[Gemini] JSON malformé:", parseErr.message, "| Raw:", rawText);
      throw new Error("JSON malformé");
    }

    reply = typeof parsed.reply === "string" ? parsed.reply : "...";
    patienceChange =
      typeof parsed.patienceChange === "number" ? Math.round(parsed.patienceChange) : -2;

  } catch (err) {
    console.error("[chat] Erreur non gérée:", err.message);
    reply = "Stop. Je sature. Ton énergie est trop négative pour mon système.";
    patienceChange = -5;
  }

  // ── Mise à jour de la session ─────────────────────────────────────────────
  session.patience = Math.min(100, Math.max(0, session.patience + patienceChange));
  session.history = [
    ...session.history,
    { role: "user", content: userText },
    { role: "assistant", content: reply },
  ].slice(-SESSION_MAX_HISTORY);

  // On chiffre et on renvoie la session dans le cookie
  const sessionToken = encryptSession(session);
  res.setHeader("Set-Cookie", buildSetCookie(sessionToken));

  return res.status(200).json({
    reply,
    patienceChange,
    patience: session.patience,
    messageCount: session.messageCount,
  });
}
