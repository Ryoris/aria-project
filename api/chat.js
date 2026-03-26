export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. On change le modèle pour Gemma 3 (Version 12B pour un bon compromis)
  const MODEL_NAME = "gemma-3-12b-it"; 
  
  // 2. IMPORTANT : On passe en v1beta pour Gemma
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  
  let systemPrompt = "Tu es ARIA. ";
  if (patience > 80) systemPrompt += "Tu es adorable.";
  else if (patience > 40) systemPrompt += "Tu es très sarcastique et agacée.";
  else systemPrompt += "Tu es furieuse et insultante.";

  const lastUserMessage = messages[messages.length - 1]?.content || '';

  // IMPORTANT : On utilise le format le plus simple possible pour éviter les erreurs de version
  const payload = {
    contents: [{
      role: "user",
      parts: [{ text: `INSTRUCTION: ${systemPrompt}\n\nMESSAGE: ${lastUserMessage}` }]
    }],
    // On désactive les filtres pour que l'IA puisse être "méchante" sans être bloquée
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }
    ]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.error) return res.status(500).json({ reply: "Erreur API: " + data.error.message });

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // ON RENVOIE "reply" pour matcher ton frontend
    return res.status(200).json({ reply: aiText || "Je n'ai rien à te dire." });

  } catch (err) {
    return res.status(500).json({ reply: "L'IA est hors ligne..." });
  }
}
