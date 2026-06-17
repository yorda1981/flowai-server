const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const router = express.Router();

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-custom.onrender.com';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'flowai2024secretkey';
const evoHeaders = { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' };

const PLAN_TOKENS = { starter:10000, pro:50000, business:100000, free:5000 };

async function getAIReply(message, systemPrompt, tenantId) {
  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
  if (!tenant) return null;

  let apiKey = process.env.OPENAI_API_KEY;
  let useOwnKey = false;

  if (tenant.openai_api_key) {
    apiKey = tenant.openai_api_key;
    useOwnKey = true;
  } else {
    const used = tenant.tokens_used || 0;
    const limit = PLAN_TOKENS[tenant.plan] || PLAN_TOKENS.free;
    if (used >= limit) return '⚠️ Los créditos de IA se agotaron. El administrador debe configurar su API key.';
  }

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini', max_tokens: 300,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }]
    }, { headers: { 'Authorization': `Bearer ${apiKey}` } });

    const reply = res.data.choices[0].message.content;
    const tokens = res.data.usage?.total_tokens || 100;
    if (!useOwnKey) {
      await supabase.from('tenants').update({ tokens_used: (tenant.tokens_used||0) + tokens }).eq('id', tenantId);
    }
    return reply;
  } catch(e) {
    console.error('AI error:', e.message);
    return null;
  }
}

async function sendWhatsAppMessage(instanceName, phone, message) {
  try {
    await axios.post(`${EVOLUTION_URL}/message/sendText/${instanceName}`, {
      number: phone,
      text: message
    }, { headers: evoHeaders });
    return true;
  } catch(e) {
    console.error('Send message error:', e.response?.data || e.message);
    return false;
  }
}

// Webhook de Evolution API
router.post('/evolution/:tenantId', async (req, res) => {
  res.sendStatus(200);
  try {
    const { tenantId } = req.params;
    const body = req.body;

    console.log('Webhook recibido:', JSON.stringify(body).substring(0, 300));

    // Ignorar mensajes propios
    if (body.data?.key?.fromMe) return;
    if (body.event !== 'messages.upsert') return;

    const messageData = body.data;
    const phone = messageData?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const text = messageData?.message?.conversation ||
                 messageData?.message?.extendedTextMessage?.text || '';
    const senderName = messageData?.pushName || phone;

    if (!phone || !text) return;

    // Buscar o crear contacto
    let { data: contact } = await supabase.from('contacts')
      .select('*').eq('tenant_id', tenantId).eq('phone', phone).single();
    if (!contact) {
      const { data: nc } = await supabase.from('contacts')
        .insert([{ tenant_id: tenantId, name: senderName, phone, channel: 'whatsapp', status: 'active' }])
        .select().single();
      contact = nc;
    }

    // Buscar o crear conversación
    let { data: conv } = await supabase.from('conversations')
      .select('*').eq('tenant_id', tenantId).eq('contact_id', contact.id).eq('status', 'open').single();
    if (!conv) {
      const { data: nc } = await supabase.from('conversations')
        .insert([{ tenant_id: tenantId, contact_id: contact.id, status: 'open' }])
        .select().single();
      conv = nc;
    }

    // Guardar mensaje entrante
    await supabase.from('messages').insert([{
      tenant_id: tenantId,
      conversation_id: conv.id,
      contact_id: contact.id,
      content: text,
      direction: 'inbound',
      sent_by: 'contact'
    }]);

    // Actualizar contador de mensajes
    await supabase.from('conversations')
      .update({ updated_at: new Date() })
      .eq('id', conv.id);

    // Buscar flujo activo
    const { data: flows } = await supabase.from('flows')
      .select('*').eq('tenant_id', tenantId).eq('status', 'active').limit(1);

    let replyText = '';
    if (flows?.length > 0) {
      const flow = flows[0];
      const aiNode = flow.nodes?.find(n => n.type === 'ai');
      if (aiNode) {
        replyText = await getAIReply(text, aiNode.sub || 'Eres un asistente amable y breve. Responde en el mismo idioma del usuario.', tenantId) || '';
      }
      if (!replyText) {
        const msgNode = flow.nodes?.find(n => n.type === 'message');
        replyText = msgNode?.sub || '¡Hola! ¿En qué puedo ayudarte?';
      }
    } else {
      replyText = '¡Hola! Recibimos tu mensaje. En breve te atendemos.';
    }

    // Buscar agente de WhatsApp del tenant
    const { data: agent } = await supabase.from('agents')
      .select('*').eq('tenant_id', tenantId).eq('channel', 'whatsapp').eq('status', 'connected').single();

    if (agent?.evolution_instance && replyText) {
      const sent = await sendWhatsAppMessage(agent.evolution_instance, phone + '@s.whatsapp.net', replyText);
      if (sent) {
        await supabase.from('messages').insert([{
          tenant_id: tenantId,
          conversation_id: conv.id,
          contact_id: contact.id,
          content: replyText,
          direction: 'outbound',
          sent_by: 'ai'
        }]);

        // Incrementar ejecuciones del flujo
        if (flows?.length > 0) {
          await supabase.from('flows')
            .update({ executions: (flows[0].executions || 0) + 1 })
            .eq('id', flows[0].id);
        }
      }
    }
  } catch(e) {
    console.error('Webhook error:', e.message);
  }
});

// Webhook antiguo de Z-API (mantener por compatibilidad)
router.post('/whatsapp/:tenantId', async (req, res) => {
  res.sendStatus(200);
});

module.exports = router;
