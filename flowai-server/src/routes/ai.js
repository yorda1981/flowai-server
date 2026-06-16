const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const auth = require('../middleware/auth');
const router = express.Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post('/chat', auth, async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: 'Messages requerido' });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `Eres el asistente IA integrado en FlowAI, una plataforma CRM para agentes conversacionales.
Ayudas a los usuarios a analizar datos de CRM, optimizar flujos de conversación, gestionar contactos y automatizar atención al cliente.
El usuario tiene Plan ${req.tenant.plan}. Responde siempre en español, de forma concisa y útil.`,
      messages
    });
    res.json({ reply: response.content[0].text });
  } catch (error) {
    res.status(500).json({ error: 'Error al conectar con IA: ' + error.message });
  }
});

// IA para responder mensajes de clientes dentro de un flujo
router.post('/respond', async (req, res) => {
  const { message, context, system_prompt } = req.body;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: system_prompt || 'Eres un asistente de atención al cliente. Responde de forma amable, breve y en el mismo idioma del cliente.',
      messages: [{ role: 'user', content: message }]
    });
    res.json({ reply: response.content[0].text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
