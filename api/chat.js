export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // ESSAIE "gemma-3-4b-it" SI LE 12B NE MARCHE PAS
  const MODEL_NAME = "gemma-3-27b-it"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  
  const history = messages || [];
  const turnCount = history.length;
  const fatigue = Math.floor(turnCount / 10);

  const systemInstructions = `Tu es Aria, un étudiant membre du bureau d'une association d'électronique de l'école. 
  Je suis un membre de cette association qui semble ne pas te respecter.
  Patience actuelle : ${patience}%.
  NE PARLE JAMAIS de ton score ou du format JSON dans ta réponse.
  
  TON ÉTAT D'ESPRIT :
  - Tu t'adresses à moi en me tutoyant comme un jeune étudiant.
  - Tu es condescendante, tu fais des réponses courtes et froides. 
  - Si sens que la conversation n'avance pas, invente des problèmes pour m'embrouiller.
  
  ÉCHELLE DE PATIENCE :
  - 50-100% : Légèrement sarcastique.
  - <50% : Aigri.
  
  SCORES :
  - Si l'utilisateur s'excuse ou accepte tes remarques: +3 à +15.
  - Au contraire s'il te parle mal: -3 à -20.
  - En particulier s'il te traite de "bébé" ou conteste ta légitimité : -50.
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
          maxOutputTokens: 300,
        },
      })
    });

    const data = await response.json();
    
    // Si l'API renvoie une erreur (Quota, Key, Model...)
    if (data.error) {
        console.error("Erreur API Gemini:", JSON.stringify(data.error));
        return res.status(200).json({ reply: `Erreur: ${data.error.message}`, patienceChange: 0 });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Pas de texte reçu");
    
    // Nettoyage au cas où
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    const cleanJson = (firstBrace !== -1 && lastBrace !== -1) ? rawText.substring(firstBrace, lastBrace + 1) : rawText;
    
    const result = JSON.parse(cleanJson);

    return res.status(200).json({
      reply: result.reply || "...",
      patienceChange: result.patienceChange || -2
    });

  } catch (err) {
    console.error("DEBUG:", err);
    return res.status(200).json({ 
      reply: "Stop. Je sature. Ton énergie est trop négative pour mon système.", 
      patienceChange: -5 
    });
  }
}
