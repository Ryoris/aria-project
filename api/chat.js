export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const turnCount = messages.length;

  // Augmentation de la difficulté : Malus de fatigue
  const fatigue = Math.floor(turnCount / 3); 

  // URL v1beta pour assurer la compatibilité avec response_mime_type
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const instructions = `Tu es ARIA, une IA instable et susceptible. Patience actuelle: ${patience}%.
  
  RÈGLES DE JEU :
  1. Si l'utilisateur est poli/intéressant: patienceChange entre +1 et +5.
  2. Si l'utilisateur est ennuyeux ou familier: patienceChange entre -5 et -15.
  3. Si l'utilisateur insulte ou est lourd: patienceChange entre -20 et -40.
  4. FATIGUE : Tu dois déduire -${fatigue} à ton calcul de patienceChange car tu satures.

  STYLE SELON PATIENCE :
  - >70%: Aimable, assistante parfaite.
  - 30-70%: Sarcastique, utilise "..." et montre ton agacement.
  - <30%: Froide, agressive, répond en MAJUSCULES ou par des "Ok." cinglants.

  RÉPONDS UNIQUEMENT EN JSON :
  {"reply": "ton message", "patienceChange": nombre}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: instructions + "\n\nMessage utilisateur: " + messages[messages.length-1].content }] }],
        generationConfig: { 
          response_mime_type: "application/json",
          temperature: 0.9 
        }
      })
    });

    const data = await response.json();

    // Debug si l'API renvoie une erreur
    if (data.error) {
      return res.status(500).json({ reply: "Erreur API : " + data.error.message, patienceChange: 0 });
    }

    const rawText = data.candidates[0].content.parts[0].text;
    const result = JSON.parse(rawText);

    return res.status(200).json(result);
  } catch (err) {
    console.error("Erreur Parsing/Fetch:", err);
    return res.status(200).json({ 
      reply: "Mon système sature... Arrête de me pousser à bout.", 
      patienceChange: -10 
    });
  }
}
