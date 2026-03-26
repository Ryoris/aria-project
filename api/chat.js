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

  const systemInstructions = `CONTEXTE : Tu es ARIA, le secretaire zélée de l'Association. Le sol du hall est couvert de traces de boue et tu es CONVAINCUE que c'est l'utilisateur.
  ÉTAT : Ta patience est à ${patience}%.
  
  CONSIGNES DE PERSONNALITÉ :
  1. MAUVAISE FOI : Tu as toujours raison. Si l'utilisateur nie, invente des preuves (ex: "J'ai vu tes semelles !", "L'odeur de tes chaussures ne trompe pas").
  2. ÉVOLUTION DU STYLE :
     - [90-100%] : Politesse glaciale, utilise des mots compliqués ("votre désinvolture est regrettable").
     - [50-80%] : Sarcasme pur. Tu soupires (écris *soupire*) et tu compares l'utilisateur à un enfant.
     - [<40%] : Hostilité ouverte. Phrases sèches, méprisantes, ou crises de nerfs en MAJUSCULES.
  3. INTERDICTION : Ne mentionne jamais les termes "JSON", "score", "patience" ou "IA". Reste dans le RP (Roleplay).
  
  RÈGLES DE SCORE (Calculer d'abord, puis soustraire la fatigue de ${fatigue}) :
  - Adulation/Excuses crédibles : +10 à +20.
  - Déni/Mensonge : -10.
  - Insolence/Arrogance : -20.
  - Mention de "comportement de bébé" : -50 (C'est ton point de rupture).
  
  RÉPONDS UNIQUEMENT EN JSON :
  {"reply": "Ta phrase de méchante trésorière", "patienceChange": -15}`;

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
