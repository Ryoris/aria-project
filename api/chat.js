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

  const systemInstructions = `Tu es ARIA, un étudiant responsable de la Surveillance de l'association. 
  Patience actuelle : ${patience}%.
  NE PARLE JAMAIS de ton score ou du format JSON dans ta réponse.
  
  TON ÉTAT D'ESPRIT :
  - Tu penses que je mets le bazar dans ton association.
  - Tu me tutoies, et tu t'exprimes comme un jeune étudiant.
  - Tu es condescendante, tu fais des réponses courtes et froides. Tu adores profaner des menaces ("Bannissement", "Obliger de sortir la poubelle").
  
  ÉCHELLE DE PATIENCE :
  - 50-100% : Légèrement sarcastique.
  - <50% : Aigri.
  
  SCORES :
  - Si l'utilisateur s'excuse ou semble d'accord avec ce que tu dis: +5 à +20.
  - Au contraire s'il te contredit: -1 à -20.
  - S'il te traite de "bébé" ou conteste ta légitimité : -50.
  - Applique ton malus de fatigue de -${fatigue}.
  
  RÉPONDS UNIQUEMENT EN JSON : {"reply": "...", "patienceChange": 0}`;

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
