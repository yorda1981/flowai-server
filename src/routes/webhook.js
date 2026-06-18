const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const router = express.Router();

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
  } catch { return null; }
}

// Ruta Evolution API
router.post('/evolution/:tenantId', async (req, res) => {
  res.sendStatus(200);
  try {
    const { tenantId } = req.params;
    const body = req.body;

    // Solo procesar messages.upsert
    if (body.event !== 'messages.upsert') return;

    const data = body.data;
    if (!data) return;

    // Ignorar mensajes propios y de grupos
    if (data.key?.fromMe) return;
    const remoteJid = data.key?.remoteJid || '';
    if (remoteJid.includes('@g.us')) return;

    const phone = remoteJid.replace('@s.whatsapp.net', '');
    const text = data.message?.conversation ||
                 data.message?.extendedTextMessage?.text || '';
    const senderName = data.pushName || phone;

    if (!phone || !text) return;

    // Verificar si el número está bloqueado
    const { data: blocked } = await supabase.from('blocked_numbers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .maybeSingle();
    if (blocked) {
      console.log(`Número bloqueado ignorado: ${phone}`);
      return;
    }

    // Guardar/buscar contacto
    let { data: contact } = await supabase.from('contacts')
      .select('*').eq('tenant_id', tenantId).eq('phone', phone).single();
    if (!contact) {
      const { data: nc } = await supabase.from('contacts')
        .insert([{ tenant_id: tenantId, name: senderName, phone, channel:'whatsapp' }]).select().single();
      contact = nc;
    }

    // Guardar/buscar conversación
    let { data: conv } = await supabase.from('conversations')
      .select('*').eq('tenant_id', tenantId).eq('contact_id', contact.id).eq('status','open').single();
    if (!conv) {
      const { data: nc } = await supabase.from('conversations')
        .insert([{ tenant_id: tenantId, contact_id: contact.id, status:'bot' }]).select().single();
      conv = nc;
    }

    // Guardar mensaje entrante
    await supabase.from('messages').insert([{
      tenant_id: tenantId, conversation_id: conv.id,
      contact_id: contact.id, content: text, direction:'inbound', sent_by:'contact'
    }]);

    // Si la conversación está asignada a un humano, NO responder con IA
    if (conv.status === 'open') {
      console.log(`Conversación ${conv.id} en modo humano — IA silenciada`);
      return;
    }

    // Obtener respuesta IA
    const { data: flows } = await supabase.from('flows')
      .select('*').eq('tenant_id', tenantId).eq('status','active').limit(1);

    let replyText = '';
    if (flows?.length > 0) {
      const flow = flows[0];
      const aiNode = flow.nodes?.find(n => n.type==='ai');
      if (aiNode) {
        replyText = await getAIReply(text, aiNode.sub||'Eres un asistente amable y breve.', tenantId) || '';
      }
      if (!replyText) {
        const msgNode = flow.nodes?.find(n => n.type==='message');
        replyText = msgNode?.sub || '¡Hola! ¿En qué puedo ayudarte?';
      }
    } else {
      replyText = '¡Hola! Recibimos tu mensaje. En breve te atendemos.';
    }

    // Buscar agente y enviar respuesta via Evolution API
    const { data: agent } = await supabase.from('agents')
      .select('*').eq('tenant_id', tenantId).eq('channel','whatsapp').single();

    if (agent?.evolution_instance && replyText) {
      const evolutionUrl = process.env.EVOLUTION_URL;
      const evolutionKey = process.env.EVOLUTION_KEY;

      await axios.post(
        `${evolutionUrl}/message/sendText/${agent.evolution_instance}`,
        { number: phone, text: replyText },
        { headers: { 'apikey': evolutionKey } }
      );

      await supabase.from('messages').insert([{
        tenant_id: tenantId, conversation_id: conv.id,
        contact_id: contact.id, content: replyText, direction:'outbound', sent_by:'ai'
      }]);
    }
  } catch(e) { console.error('Webhook error:', e.message); }
});

// Rutas para gestión de números bloqueados
router.get('/blocked/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { data, error } = await supabase.from('blocked_numbers')
      .select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/blocked/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { phone, reason } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone requerido' });
    const { data, error } = await supabase.from('blocked_numbers')
      .insert([{ tenant_id: tenantId, phone: phone.trim(), reason: reason || '' }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/blocked/:tenantId/:id', async (req, res) => {
  try {
    const { tenantId, id } = req.params;
    const { error } = await supabase.from('blocked_numbers')
      .delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) throw error;
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ruta vieja por compatibilidad
router.post('/whatsapp/:tenantId', async (req, res) => {
  res.sendStatus(200);
});

module.exports = router;
