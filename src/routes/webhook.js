const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const router = express.Router();

async function callOpenAI(message, systemPrompt) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data.choices[0].message.content;
  } catch (e) {
    return null;
  }
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
      const { data: newContact } = await supabase.from('contacts')
        .insert([{ tenant_id: tenantId, name: body.senderName || phone, phone, channel: 'whatsapp' }])
        .select().single();
      contact = newContact;
    }

    let { data: conversation } = await supabase.from('conversations')
      .select('*').eq('tenant_id', tenantId).eq('contact_id', contact.id).eq('status', 'open').single();

    if (!conversation) {
      const { data: newConv } = await supabase.from('conversations')
        .insert([{ tenant_id: tenantId, contact_id: contact.id, status: 'bot' }]).select().single();
      conversation = newConv;
    }

    await supabase.from('messages').insert([{
      tenant_id: tenantId, conversation_id: conversation.id,
      contact_id: contact.id, content: text, direction: 'inbound', sent_by: 'contact'
    }]);

    const { data: flows } = await supabase.from('flows')
      .select('*').eq('tenant_id', tenantId).eq('status', 'active').limit(1);

    let replyText = '';

    if (flows && flows.length > 0) {
      const flow = flows[0];
      const aiNode = flow.nodes?.find(n => n.type === 'ai');
      if (aiNode && process.env.OPENAI_API_KEY) {
        replyText = await callOpenAI(text, aiNode.sub || 'Eres un asistente de atención al cliente amable y breve.');
      }
      if (!replyText) {
        const msgNode = flow.nodes?.find(n => n.type === 'message');
        replyText = msgNode?.sub || '¡Hola! ¿En qué puedo ayudarte?';
      }
    } else {
      replyText = '¡Hola! Recibimos tu mensaje. En breve te atendemos.';
    }

    const { data: agent } = await supabase.from('agents')
      .select('*').eq('tenant_id', tenantId).eq('channel', 'whatsapp').single();

    if (agent?.zapi_instance && agent?.zapi_token && replyText) {
      await axios.post(
        `${process.env.ZAPI_BASE_URL}/${agent.zapi_instance}/token/${agent.zapi_token}/send-text`,
        { phone, message: replyText }
      );
      await supabase.from('messages').insert([{
        tenant_id: tenantId, conversation_id: conversation.id,
        contact_id: contact.id, content: replyText, direction: 'outbound', sent_by: 'ai'
      }]);
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

module.exports = router;
