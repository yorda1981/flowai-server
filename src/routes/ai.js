const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const supabase = require('../supabase');
const router = express.Router();

const PLAN_TOKENS = {
  starter: 50000,
  pro: 200000,
  business: 500000,
  free: 10000
};

async function getTenant(id) {
  const { data } = await supabase.from('tenants').select('*').eq('id', id).single();
  return data;
}

async function callAI(messages, system, tenantId) {
  const tenant = await getTenant(tenantId);
  if (!tenant) throw new Error('Tenant no encontrado');

  // Decidir qué API key usar
  let apiKey = process.env.OPENAI_API_KEY;
  let useOwnKey = false;

  if (tenant.openai_api_key) {
    apiKey = tenant.openai_api_key;
    useOwnKey = true;
  } else {
    // Verificar tokens disponibles
    const tokensUsed = tenant.tokens_used || 0;
    const tokensLimit = PLAN_TOKENS[tenant.plan] || PLAN_TOKENS.free;
    if (tokensUsed >= tokensLimit) {
      throw new Error('TOKENS_EXCEEDED');
    }
  }

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    max_tokens: 500,
    messages: [{ role: 'system', content: system }, ...messages]
  }, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  });

  const reply = response.data.choices[0].message.content;
  const tokensConsumed = response.data.usage?.total_tokens || 100;

  // Solo descontar si usa nuestra key
  if (!useOwnKey) {
    await supabase.from('tenants')
      .update({ tokens_used: (tenant.tokens_used || 0) + tokensConsumed })
      .eq('id', tenantId);
  }

  return { reply, tokensConsumed, useOwnKey };
}

// Chat del panel admin
router.post('/chat', auth, async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: 'Messages requerido' });
  try {
    const { reply } = await callAI(messages,
      `Eres el asistente IA de FlowAI CRM. Ayudas con contactos, flujos y automatización. Plan del usuario: ${req.tenant.plan}. Responde en español, conciso y útil.`,
      req.tenant.id
    );
    res.json({ reply });
  } catch (e) {
    if (e.message === 'TOKENS_EXCEEDED') {
      return res.status(402).json({ error: 'TOKENS_EXCEEDED', message: 'Créditos de IA agotados. Conecta tu propia API key en Configuración.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// IA para flujos/webhook
router.post('/respond', async (req, res) => {
  const { message, system_prompt, tenant_id } = req.body;
  try {
    const { reply } = await callAI(
      [{ role: 'user', content: message }],
      system_prompt || 'Eres un asistente de atención al cliente amable y breve.',
      tenant_id
    );
    res.json({ reply });
  } catch (e) {
    if (e.message === 'TOKENS_EXCEEDED') {
      return res.status(402).json({ error: 'TOKENS_EXCEEDED' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Guardar API key del cliente
router.post('/save-key', auth, async (req, res) => {
  const { openai_api_key } = req.body;
  if (!openai_api_key) return res.status(400).json({ error: 'API key requerida' });
  
  // Verificar que la key sea válida
  try {
    await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini', max_tokens: 5,
      messages: [{ role: 'user', content: 'test' }]
    }, { headers: { 'Authorization': `Bearer ${openai_api_key}` } });
  } catch {
    return res.status(400).json({ error: 'API key inválida. Verifica que sea correcta.' });
  }

  await supabase.from('tenants').update({ openai_api_key }).eq('id', req.tenant.id);
  res.json({ success: true, message: 'API key guardada. Ahora usas tu propia IA sin límites.' });
});

// Obtener uso de tokens
router.get('/usage', auth, async (req, res) => {
  const tenant = await getTenant(req.tenant.id);
  const tokensUsed = tenant?.tokens_used || 0;
  const tokensLimit = PLAN_TOKENS[tenant?.plan] || PLAN_TOKENS.free;
  const hasOwnKey = !!tenant?.openai_api_key;
  res.json({
    tokens_used: tokensUsed,
    tokens_limit: tokensLimit,
    tokens_remaining: Math.max(0, tokensLimit - tokensUsed),
    percentage: Math.min(100, Math.round((tokensUsed / tokensLimit) * 100)),
    has_own_key: hasOwnKey,
    plan: tenant?.plan
  });
});

module.exports = router;
