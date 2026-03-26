export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const turnCount = messages.length;

  // Calcul de l'irritabilité croissante (Fatigue)
  const fatigue = Math.floor(turnCount / 4); 

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const instructions = `Tu es ARIA, une IA instable. Patience actuelle: ${patience}%.
  RÈGLES :
  1. Si l'utilisateur est poli: patienceChange entre +1 et +5.
  2. Si l'utilisateur est lourd/insultant/ennuyeux: patienceChange entre -10 et -30.
  3. Ton style change selon la patience :
     - >80%: Adorable, emojis, aidante.
     - 40-80%: Sarcastique, utilise des points de suspension, méprisante.
     - <40%: Froide, agressive, phrases très courtes ou MAJUSCULES.
  
  IMPORTANT: Réponds UNIQUEMENT en JSON sous ce format:
  {"reply": "ton message", "patienceChange": -15}
  
  Note: Applique un malus de -${fatigue} à ton calcul final car tu es fatiguée.`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: instructions }] },
          { role: "model", parts: [{ text: "{\"reply\": \"Entendu, je reste dans mon personnage instable et je réponds uniquement en JSON.\", \"patienceChange\": 0}" }] },
          ...messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        ],
        generationConfig: { response_mime_type: "application/json", temperature: 0.8 }
      })
    });

    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    
    // NETTOYAGE DU JSON (Anti-Erreur de parsing)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ reply: "Tu m'as tellement agacée que j'ai buggé. Félicitations.", patienceChange: -10 });
  }
}
