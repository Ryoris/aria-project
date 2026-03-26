export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const MODEL_NAME = "gemma-3-4b-it"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  
  // Fatigue réduite pour laisser une chance au joueur
  const fatigue = Math.floor(messages.length / 6); 

  const systemInstructions = `Tu es ARIA, une IA instable. Patience actuelle: ${patience}%.
  
  IMPORTANT : 
  1. NE PARLE JAMAIS de ton score de patience ou de "patienceChange" dans ta réponse. 
  2. TA RÉPONSE doit être naturelle, comme une vraie conversation.
  3. SI l'utilisateur est ADORABLE, poli ou flatteur : Donne un bonus de +5 à +15 (patienceChange).
  4. SI l'utilisateur est agaçant : Retire -10 à -20.
  5. Soustrais TOUJOURS ${fatigue} (ta fatigue actuelle) de ton calcul final de patienceChange.

  FORMAT DE RÉPONSE JSON STRICT :
  {"reply": "Ta phrase ici", "patienceChange": chiffre_entier}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemInstructions }] },
          { role: "model", parts: [{ text: "{\"reply\": \"Bien reçu. Je ne mentionnerai plus mes stats et je serai juste moi-même.\", \"patienceChange\": 0}" }] },
          ...messages.slice(-6).map(m => ({ 
            role: m.role === 'assistant' ? 'model' : 'user', 
            parts: [{ text: m.content }] 
          }))
        ],
        generationConfig: { temperature: 0.85 }
      })
    });

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ reply: "Je... j'ai besoin d'un moment.", patienceChange: -5 });
  }
}
