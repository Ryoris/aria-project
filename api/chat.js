export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const MODEL_NAME = "gemma-3-12b-it"; 
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
          parts: [{ text: `${systemInstructions}\n\nHistorique: ${JSON.stringify(messages.slice(-6))}\n\nRéponse JSON :` }]
        }],
        generationConfig: { 
          temperature: 0.8, // Légèrement monté pour plus de "piquant" dans ses insultes
          maxOutputTokens: 300 
        }
      })
    });

    // --- SÉCURITÉ AJOUTÉE ICI ---
    if (!response.ok) {
        const errorData = await response.json();
        console.error("Erreur API Google:", errorData);
        throw new Error("L'API Google a renvoyé une erreur");
    }
    
    const data = await response.json();
    
    // Sécurité si l'API est surchargée
    if (!data.candidates || !data.candidates[0]) {
      throw new Error("Réponse API vide");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Extraction sécurisée
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
       // Si l'IA n'a pas mis d'accolades du tout
       throw new Error("Format JSON introuvable");
    }
    
    // On ne garde que ce qu'il y a entre les deux
    const cleanJson = rawText.substring(firstBrace, lastBrace + 1);
    const result = JSON.parse(cleanJson);

    return res.status(200).json({
      reply: result.reply || "...",
      patienceChange: result.patienceChange || -5
    });

  } catch (err) {
    console.error("Erreur de parsing Aria:", err);
    // Au lieu de dire "cerveau grillé", on simule une réponse d'ARIA qui s'énerve de ton bug
    return res.status(200).json({ 
      reply: "Ta façon de parler est tellement illogique que mes circuits saturent. Recommence, et fais un effort !", 
      patienceChange: -10 
    });
  }
