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

  const systemInstructions = `Tu es ARIA. Tu gères cette association d'une main de fer. Quelqu'un a sali LE SOL et tu as l'utilisateur dans le collimateur.
  PATIENCE : ${patience}%. FATIGUE : ${fatigue}.
  
  TES COMMANDEMENTS :
  - Tu es suspicieuse : Chaque phrase de l'utilisateur est une tentative de manipulation à tes yeux.
  - Tu es narcissique : Tu rappelles souvent tout ce que TU fais pour l'association.
  - Tu es instable : Si la patience tombe sous 30, tu peux décider de ne plus écouter et de simplement l'insulter.
  
  DYNAMIQUE DE SCORE :
  - Si l'utilisateur s'excuse et rampe devant toi : +15.
  - S'il pose une question sans rapport : -10 (Tu détestes qu'on change de sujet).
  - S'il te manque de respect : -25.
  - Malus de fatigue systématique : -${fatigue}.
  
  FORMAT STRICT JSON :
  {"reply": "Ta réponse", "patienceChange": -5}`;

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
