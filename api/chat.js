export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const MODEL_NAME = "gemini-1.5-flash"; // Flash est plus rapide et suit mieux le format JSON

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  
  // Calcul du malus de temps : plus on parle, plus elle est irritable par défaut
  const turnCount = messages.length;
  const irritabilityFactor = Math.floor(turnCount / 2); 

  const instructions = `
    Tu es ARIA, une IA instable et ultra-sensible.
    TON ÉTAT ACTUEL : Patience à ${patience}%. 
    (100% = Adorable, 50% = Sarcastique, 10% = Furieuse).

    RÈGLES :
    1. Si l'utilisateur est poli, la patience peut monter (+5).
    2. Si l'utilisateur est familier, ennuyeux ou impoli, la patience baisse (entre -10 et -30).
    3. Tu dois TOUJOURS répondre en JSON strict avec ce format :
    {
      "reply": "Ta réponse textuelle ici",
      "patienceChange": -15
    }

    Note : Applique un malus de -${irritabilityFactor} à chaque calcul car tu fatigues.
  `;

  const payload = {
    contents: [
        { role: "user", parts: [{ text: instructions }] },
        { role: "model", parts: [{ text: "Compris. Je répondrai uniquement en JSON strict sous le format demandé." }] },
        ...messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }))
    ],
    generationConfig: { 
        response_mime_type: "application/json",
        temperature: 0.9 // Plus de "personnalité"
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0]) {
        throw new Error("Réponse vide de l'IA");
    }

    const rawText = data.candidates[0].content.parts[0].text;
    const result = JSON.parse(rawText);

    return res.status(200).json({ 
      reply: result.reply, 
      patienceChange: result.patienceChange 
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ reply: "ARIA a eu un court-circuit... (Erreur de parsing)", patienceChange: -5 });
  }
}
