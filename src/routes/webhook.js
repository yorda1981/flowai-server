const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const router = express.Router();

const PLAN_TOKENS = { starter:50000, pro:200000, business:500000, free:10000 };

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

router.post('/whatsapp/:tenantId', async (req, res) => {
  res.sendStatus(200);
  try {
    const { tenantId } = req.params;
    const body = req.body;
    if (body.fromMe) return;
    const phone = body.phone || body.from;
    const text = body.text?.message || body.message || '';
    if (!phone || !text) return;

    let { data: contact } = await supabase.from('contacts')
      .select('*').eq('tenant_id', tenantId).eq('phone', phone).single();
    if (!contact) {
      const { data: nc } = await supabase.from('contacts')
        .insert([{ tenant_id: tenantId, name: body.senderName||phone, phone, channel:'whatsapp' }]).select().single();
      contact = nc;
    }

    let { data: conv } = await supabase.from('conversations')
      .select('*').eq('tenant_id', tenantId).eq('contact_id', contact.id).eq('status','open').single();
    if (!conv) {
      const { data: nc } = await supabase.from('conversations')
        .insert([{ tenant_id: tenantId, contact_id: contact.id, status:'bot' }]).select().single();
      conv = nc;
    }

    await supabase.from('messages').insert([{
      tenant_id: tenantId, conversation_id: conv.id,
      contact_id: contact.id, content: text, direction:'inbound', sent_by:'contact'
    }]);

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

    const { data: agent } = await supabase.from('agents')
      .select('*').eq('tenant_id', tenantId).eq('channel','whatsapp').single();

    if (agent?.zapi_instance && agent?.zapi_token && replyText) {
      await axios.post(
        `${process.env.ZAPI_BASE_URL}/${agent.zapi_instance}/token/${agent.zapi_token}/send-text`,
        { phone, message: replyText }
      );
      await supabase.from('messages').insert([{
        tenant_id: tenantId, conversation_id: conv.id,
        contact_id: contact.id, content: replyText, direction:'outbound', sent_by:'ai'
      }]);
    }
  } catch(e) { console.error('Webhook error:', e.message); }
});

module.exports = router;
