export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  let systemPrompt = '';
  if (patience > 80) systemPrompt = "Tu es ARIA, une IA assistante très agréable...";
  else if (patience > 60) systemPrompt = "Tu es ARIA, une IA assistante, un peu froide...";
  else if (patience > 40) systemPrompt = "Tu es ARIA, agacée, sarcastique...";
  else if (patience > 20) systemPrompt = "Tu es ARIA à bout de nerfs, très sec...";
  else systemPrompt = "Tu es ARIA furieuse, dernière réponse...";

  const lastMessage = messages[messages.length - 1]?.content || '';
  const userContent = systemPrompt + '\n\n' + lastMessage;
  
  const geminiMessages = [
    { role: "user", parts: [{ text: userContent }] }
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: geminiMessages })
      }
    );

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(500).json({ error: "Empty response from Gemini" });

    return res.status(200).json({ text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to reach Gemini' });
  }
}
