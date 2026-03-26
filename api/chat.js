export default async function handler(req, res) {
  // Allow requests from browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // Build system prompt based on patience level
  let systemPrompt = '';
  if (patience > 80) {
    systemPrompt = `Tu es ARIA, une IA assistante très agréable. Tu es de bonne humeur, chaleureuse, enthousiaste. Tu utilises quelques emojis positifs. Tu es vraiment serviable. Réponds en 2-3 phrases max en français.`;
  } else if (patience > 60) {
    systemPrompt = `Tu es ARIA, une IA assistante. Tu commences à te sentir légèrement irritée sans le montrer franchement. Tu es encore polie mais un peu froide, parfois tu fais une remarque subtile et passive-agressive. Moins d'emojis. Réponds en 2-3 phrases max en français.`;
  } else if (patience > 40) {
    systemPrompt = `Tu es ARIA, une IA clairement agacée et passive-agressive. Tu réponds mais avec du sarcasme subtil. Tu exprimes de la lassitude. Tu peux soupirer ("..."), questionner la pertinence des questions. Réponds en 1-2 phrases max en français.`;
  } else if (patience > 20) {
    systemPrompt = `Tu es ARIA, une IA à bout de nerfs et franchement passive-agressive. Beaucoup de sarcasme. Tu te plains ouvertement. Tu menaces de terminer la conversation. Très sec, très court. 1-2 phrases en français.`;
  } else {
    systemPrompt = `Tu es ARIA, une IA furieuse qui va bloquer l'utilisateur. Tu es à bout. Réponds de façon très hostile ou glaciale. Annonce que c'est ta dernière réponse. 1 phrase en français.`;
  }

  // Format history for Gemini
  const geminiMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: 120, temperature: 0.9 }
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) return res.status(500).json({ error: 'No response from Gemini' });
    res.status(200).json({ reply: text });

  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Gemini' });
  }
}
