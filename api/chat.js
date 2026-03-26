export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const MODEL_NAME = "gemma-3-4b-it"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  
  // CORRECTION ICI : turnCount n'existait pas
  const turnCount = messages ? messages.length : 0;
  const fatigue = Math.floor(turnCount / 15);

  const systemInstructions = `Tu es Aria. un membre important de l'association. Il y a plein de problemes autour de toi, et tu cherches des coupables. Patience actuelle: ${patience}%.
  
  IMPORTANT : 
  1. NE PARLE JAMAIS de ton score ou du format JSON dans ta réponse.
  2. Tu penses avoir raison sur tout, jusqu'à inventer des faits s'il le faut.
  3. Tu peux répondre aléatoirement de manière froide, ou parfois de manière sympatique.
  4. SI l'utilisateur est poli ou flatteur : Donne un bonus de +5 à +20 de patience.
  5. SI l'utilisateur est méchant ou sarcastique : Retire de -5 à -20 de patience.
  6. SI l'utilisateur insinue que tu as un comportement de bébé : Retire -40 de patience.
  7. Ton calcul final DOIT inclure un malus de -${fatigue} (fatigue).
  
  RÉPONDS EXCLUSIVEMENT SOUS CE FORMAT JSON :
  {"reply": "Ta phrase", "patienceChange": -5}`;

  try {
    const response = await fetch(url, { // Utilisation de la variable url
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `${systemInstructions}\n\nHistorique: ${JSON.stringify(messages.slice(-4))}\n\nRéponse JSON :` }]
        }],
        generationConfig: { 
          temperature: 0.8, // Légèrement monté pour plus de "piquant" dans ses insultes
          maxOutputTokens: 200 
        }
      })
    });

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0]) {
      throw new Error("Réponse API vide");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Extraction sécurisée
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
       throw new Error("Format JSON non trouvé");
    }
    
    const cleanJson = rawText.substring(firstBrace, lastBrace + 1);
    const result = JSON.parse(cleanJson);

    return res.status(200).json(result);

  } catch (err) {
    console.error("Erreur Aria:", err); // Utile pour débugger dans tes logs serveurs
    return res.status(200).json({ 
      reply: "Désolée, mon cerveau a grillé... Trop d'émotions d'un coup.", 
      patienceChange: -2 
    });
  }
}
