const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const router = express.Router();

async function callOpenAI(messages, system, maxTokens = 1000) {
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      ...messages
    ]
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data.choices[0].message.content;
}

// Chat del panel admin
router.post('/chat', auth, async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: 'Messages requerido' });
  try {
    const reply = await callOpenAI(messages,
      `Eres el asistente IA integrado en FlowAI, una plataforma CRM para agentes conversacionales.
Ayudas a los usuarios a analizar datos de CRM, optimizar flujos de conversación y automatizar atención al cliente.
El usuario tiene Plan ${req.tenant.plan}. Responde siempre en español, de forma concisa y útil.`
    );
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: 'Error IA: ' + error.message });
  }
});

// IA para responder mensajes de clientes dentro de un flujo
router.post('/respond', async (req, res) => {
  const { message, system_prompt } = req.body;
  try {
    const reply = await callOpenAI(
      [{ role: 'user', content: message }],
      system_prompt || 'Eres un asistente de atención al cliente. Responde de forma amable, breve y en el mismo idioma del cliente.',
      300
    );
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
