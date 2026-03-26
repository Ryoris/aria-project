export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const MODEL_NAME = "gemma-3-4b-it"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  
  // Fatigue plus douce : -1 tous les 6 messages
  const fatigue = Math.floor(turnCount / 6);

  const systemInstructions = `Tu es Aria. Patience actuelle: ${patience}%.
  
  IMPORTANT : 
  1. NE PARLE JAMAIS de ton score ou du format JSON dans ta réponse.
  2. EN FONCTION DE TA PATIENCE, tu es Sympatique (=>70%) ou Froide (<70%).
  3. SI l'utilisateur est ADORABLE, poli ou flatteur : Donne un bonus de +1 à +5 (patienceChange).
  4. SI l'utilisateur est méprisant : Retire de -1 à -20.
  5. SI l'utilisateur insinue que tu as un comportement de bébé : Retire 50.
  6. Ton calcul final DOIT inclure un malus de -${fatigue} (fatigue).
  
  RÉPONDS EXCLUSIVEMENT SOUS CE FORMAT JSON :
  {"reply": "Ta phrase", "patienceChange": -5}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `${systemInstructions}\n\nHistorique: ${JSON.stringify(messages.slice(-4))}\n\nRéponse JSON :` }]
        }],
        generationConfig: { 
          temperature: 0.7, // On baisse un peu pour plus de stabilité
          maxOutputTokens: 150 
        }
      })
    });

    const data = await response.json();
    
    // Si l'API renvoie une erreur directe
    if (!data.candidates) {
      return res.status(200).json({ reply: "Je sature... trop de requêtes.", patienceChange: -2 });
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Extraction ultra-robuste du JSON
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
       throw new Error("Pas de JSON valide");
    }
    
    const cleanJson = rawText.substring(firstBrace, lastBrace + 1);
    const result = JSON.parse(cleanJson);

    return res.status(200).json(result);

  } catch (err) {
    // En cas d'erreur de parsing, on renvoie une réponse par défaut cohérente au lieu de planter
    return res.status(200).json({ 
      reply: "Tes paroles m'embrouillent l'esprit.", 
      patienceChange: -5 
    });
  }
}
