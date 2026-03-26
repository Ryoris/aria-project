export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // 1. Définition du comportement (Prompt Système)
  let systemPrompt = "Tu es ARIA. ";
  if (patience > 80) systemPrompt += "Tu es très agréable et polie.";
  else if (patience > 60) systemPrompt += "Tu es un peu froide et concise.";
  else if (patience > 40) systemPrompt += "Tu es agacée et sarcastique.";
  else if (patience > 20) systemPrompt += "Tu es à bout de nerfs et très sèche.";
  else systemPrompt += "Tu es furieuse, c'est ta dernière réponse.";

  // 2. Extraction du dernier message de l'utilisateur
  const lastUserMessage = messages && messages.length > 0 
    ? messages[messages.length - 1].content 
    : "";

  // 3. Construction du Payload (Version simplifiée compatible v1)
  // On place le système ET le message dans 'contents' pour éviter les erreurs de version
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: `CONSIGNE SYSTÈME: ${systemPrompt}\n\nMESSAGE UTILISATEUR: ${lastUserMessage}` }]
      }
    ],
    // On baisse le seuil de sécurité pour éviter les blocages sur le ton "furieux"
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }
    ]
  };

  try {
    // On utilise l'URL v1 qui est la plus stable pour Gemini 2.5
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    // Vérification du blocage par filtre de sécurité (Cause possible du "...")
    if (data.candidates?.[0]?.finishReason === "SAFETY") {
      return res.status(200).json({ text: "ARIA est trop énervée pour répondre (Bloqué par filtre de sécurité)." });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      return res.status(500).json({ error: "Réponse vide, vérifiez les logs API." });
    }

    return res.status(200).json({ text });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to reach Gemini' });
  }
}
