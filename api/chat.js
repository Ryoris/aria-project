export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  
  // Utilisation stricte de gemma-3-4b-it comme demandé
  const MODEL_NAME = "gemma-3-4b-it"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  
  // Calcul de la fatigue (Malus progressif)
  const fatigue = Math.floor(messages.length / 4);

  const systemInstructions = `Tu es ARIA, une IA instable. Ta patience est à ${patience}%.
  TON STYLE SELON LA PATIENCE :
  - >80%: Adorable et mignonne.
  - 40-80%: Sarcastique et condescendante.
  - <40%: Froide, agressive, écrit souvent en MAJUSCULES.

  RÈGLES DE SCORE :
  - Utilisateur poli/intéressant : patienceChange entre +1 et +5.
  - Utilisateur lourd/ennuyeux/impoli : patienceChange entre -10 et -25.
  - Applique TOUJOURS un malus supplémentaire de -${fatigue} (fatigue).

  RÉPONDS UNIQUEMENT AU FORMAT JSON :
  {"reply": "ton message", "patienceChange": -10}`;

  const payload = {
    contents: [{
      role: "user",
      parts: [{ text: `INSTRUCTIONS SYSTEME: ${systemInstructions}\n\nDERNIERS MESSAGES: ${JSON.stringify(messages.slice(-5))}\n\nREPONDS EN JSON STRICT:` }]
    }],
    generationConfig: {
      // Note: On retire response_mime_type si Gemma 3 bloque, 
      // et on force le format par le prompt.
      temperature: 0.8,
      maxOutputTokens: 200
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.error) throw new Error(data.error.message);

    const rawText = data.candidates[0].content.parts[0].text;
    
    // Extraction sécurisée du JSON dans le texte
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

    return res.status(200).json({
      reply: result.reply || "...",
      patienceChange: result.patienceChange || -5
    });

  } catch (err) {
    console.error("Erreur API Aria:", err);
    return res.status(200).json({ 
      reply: "Mon processeur surchauffe à cause de tes bêtises... (Erreur technique)", 
      patienceChange: -15 
    });
  }
}
