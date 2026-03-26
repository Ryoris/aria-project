export default async function handler(req, res) {
  // 1. Gestion des Headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Gestion du preflight (requête de vérification du navigateur)
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Restriction à la méthode POST uniquement
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, patience } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante dans les variables d env' });

  // 2. Définition du caractère d'ARIA selon la patience
  let systemPrompt = "";
  if (patience > 80) systemPrompt = "Tu es ARIA, une IA assistante très agréable et polie.";
  else if (patience > 60) systemPrompt = "Tu es ARIA, une IA assistante, un peu froide et concise.";
  else if (patience > 40) systemPrompt = "Tu es ARIA, agacée, sarcastique et tu n'as pas envie d'aider.";
  else if (patience > 20) systemPrompt = "Tu es ARIA à bout de nerfs, très sèche et méprisante.";
  else systemPrompt = "Tu es ARIA furieuse, c'est ta dernière réponse avant de couper court.";

  // 3. Préparation du message pour l'API
  const lastUserMessage = messages[messages.length - 1]?.content || '';
  
  // Utilisation du modèle stable gemini-1.5-flash
  const MODEL_NAME = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

  const payload = {
    // On définit le comportement d'ARIA ici
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    // On envoie le contenu utilisateur ici
    contents: [
      {
        role: "user",
        parts: [{ text: lastUserMessage }]
      }
    ]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    // Gestion des erreurs renvoyées par Google
    if (!response.ok) {
      console.error("Erreur Google API:", data);
      return res.status(response.status).json({ error: data.error?.message || "Erreur API" });
    }

    // Extraction de la réponse textuelle
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({ error: "L'IA a renvoyé une réponse vide." });
    }

    // On renvoie le texte au front-end
    return res.status(200).json({ text });

  } catch (err) {
    console.error("Erreur Fetch:", err);
    return res.status(500).json({ error: 'Impossible de contacter Gemini' });
  }
}
