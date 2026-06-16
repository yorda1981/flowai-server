const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Webhook Z-API WhatsApp
router.post('/whatsapp/:tenantId', async (req, res) => {
  res.sendStatus(200); // responde rápido a Z-API

  try {
    const { tenantId } = req.params;
    const body = req.body;

    // Ignorar mensajes propios
    if (body.fromMe) return;

    const phone = body.phone || body.from;
    const text = body.text?.message || body.message || '';
    if (!phone || !text) return;

    // Buscar o crear contacto
    let { data: contact } = await supabase.from('contacts')
      .select('*').eq('tenant_id', tenantId).eq('phone', phone).single();

    if (!contact) {
      const { data: newContact } = await supabase.from('contacts')
        .insert([{ tenant_id: tenantId, name: body.senderName || phone, phone, channel: 'whatsapp' }])
        .select().single();
      contact = newContact;
    }

    // Guardar mensaje entrante
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

    // Buscar flujo activo del agente
    const { data: flows } = await supabase.from('flows')
      .select('*').eq('tenant_id', tenantId).eq('status', 'active').limit(1);

    let replyText = '';

    if (flows && flows.length > 0) {
      // Ejecutar nodo IA si existe en el flujo
      const flow = flows[0];
      const aiNode = flow.nodes?.find(n => n.type === 'ai');
      if (aiNode) {
        const aiRes = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          system: aiNode.sub || 'Eres un asistente de atención al cliente. Responde de forma amable y breve.',
          messages: [{ role: 'user', content: text }]
        });
        replyText = aiRes.content[0].text;
      } else {
        // Usar primer nodo de mensaje
        const msgNode = flow.nodes?.find(n => n.type === 'message');
        replyText = msgNode?.sub || '¡Hola! ¿En qué puedo ayudarte?';
      }
    } else {
      replyText = '¡Hola! Recibimos tu mensaje. En breve te atendemos.';
    }

    // Buscar agente WhatsApp del tenant
    const { data: agent } = await supabase.from('agents')
      .select('*').eq('tenant_id', tenantId).eq('channel', 'whatsapp').single();

    if (agent?.zapi_instance && agent?.zapi_token && replyText) {
      // Enviar respuesta por Z-API
      await axios.post(
        `${process.env.ZAPI_BASE_URL}/${agent.zapi_instance}/token/${agent.zapi_token}/send-text`,
        { phone, message: replyText }
      );

      // Guardar mensaje saliente
      await supabase.from('messages').insert([{
        tenant_id: tenantId, conversation_id: conversation.id,
        contact_id: contact.id, content: replyText, direction: 'outbound', sent_by: 'ai'
      }]);

      // Actualizar stats
      await supabase.from('tenants').update({ messages_used: supabase.raw('messages_used + 1') })
        .eq('id', tenantId);
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

module.exports = router;
