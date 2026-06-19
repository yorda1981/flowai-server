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

    // Guardar/buscar conversación activa (bot u open)
    let { data: conv } = await supabase.from('conversations')
      .select('*').eq('tenant_id', tenantId).eq('contact_id', contact.id)
      .in('status', ['bot', 'open'])
      .order('created_at', { ascending: false })
      .limit(1).single();
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

    // Si la conversación está en modo humano, NO responder con IA
    if (conv.status === 'open') {
      console.log(`Conversación ${conv.id} en modo humano — IA silenciada`);
      return;
    }

    // Obtener flujo activo
    const { data: flows } = await supabase.from('flows')
      .select('*').eq('tenant_id', tenantId).eq('status','active').limit(1);

    if (!flows?.length) {
      // Sin flujo activo — respuesta genérica
      const { data: agent } = await supabase.from('agents')
        .select('*').eq('tenant_id', tenantId).eq('channel','whatsapp').single();
      if (agent?.evolution_instance) {
        await axios.post(`${process.env.EVOLUTION_URL}/message/sendText/${agent.evolution_instance}`,
          { number: phone, text: '¡Hola! Recibimos tu mensaje. En breve te atendemos.' },
          { headers: { 'apikey': process.env.EVOLUTION_KEY } });
      }
      return;
    }

    const flow = flows[0];
    const nodes = flow.nodes || [];
    const currentStep = conv.flow_step || 0;
    const flowData = conv.flow_data || {};

    // Buscar nodos capture en orden
    const captureNodes = nodes.filter(n => n.type === 'capture');
    const aiNode = nodes.find(n => n.type === 'ai');
    const msgNode = nodes.find(n => n.type === 'message');

    let replyText = '';

    // Si hay nodos capture y aún no los completamos todos
    if (captureNodes.length > 0 && currentStep < captureNodes.length) {
      const currentCapture = captureNodes[currentStep];

      // Guardar la respuesta del paso anterior (si no es el primer mensaje)
      if (currentStep > 0 || flowData.capturing) {
        const prevCapture = captureNodes[currentStep - 1] || (flowData.capturing ? captureNodes[0] : null);
        if (prevCapture && flowData.capturing) {
          const field = prevCapture.field || 'custom';
          if (field === 'name') {
            await supabase.from('contacts').update({ name: text }).eq('id', contact.id);
          } else if (field === 'email') {
            await supabase.from('contacts').update({ email: text }).eq('id', contact.id);
          } else {
            const newData = { ...(contact.custom_data || {}), [field]: text };
            await supabase.from('contacts').update({ custom_data: newData }).eq('id', contact.id);
          }

          // Avanzar al siguiente paso
          const nextStep = currentStep + (flowData.capturing ? 1 : 0);
          if (nextStep >= captureNodes.length) {
            // Todos los datos capturados — responder con IA o mensaje final
            await supabase.from('conversations').update({ flow_step: nextStep, flow_data: {} }).eq('id', conv.id);
            if (aiNode) {
              replyText = await getAIReply(text, aiNode.sub || 'Eres un asistente amable y breve.', tenantId) || '';
            }
            if (!replyText) replyText = msgNode?.sub || '¡Gracias! Ya tenemos tus datos.';
          } else {
            // Hacer la siguiente pregunta
            const nextCapture = captureNodes[nextStep];
            replyText = nextCapture.sub || `¿Cuál es tu ${nextCapture.field || 'dato'}?`;
            await supabase.from('conversations').update({ flow_step: nextStep, flow_data: { capturing: true } }).eq('id', conv.id);
          }
        } else {
          // Primera vez — hacer la primera pregunta
          replyText = currentCapture.sub || `¿Cuál es tu ${currentCapture.field || 'nombre'}?`;
          await supabase.from('conversations').update({ flow_step: 0, flow_data: { capturing: true } }).eq('id', conv.id);
        }
      } else {
        // Primera vez — hacer la primera pregunta
        replyText = currentCapture.sub || `¿Cuál es tu ${currentCapture.field || 'nombre'}?`;
        await supabase.from('conversations').update({ flow_step: 0, flow_data: { capturing: true } }).eq('id', conv.id);
      }
    } else if (flowData.capturing && captureNodes.length > 0) {
      // Guardar último dato capturado
      const lastCapture = captureNodes[currentStep] || captureNodes[captureNodes.length - 1];
      const field = lastCapture?.field || 'custom';
      if (field === 'name') {
        await supabase.from('contacts').update({ name: text }).eq('id', contact.id);
      } else if (field === 'email') {
        await supabase.from('contacts').update({ email: text }).eq('id', contact.id);
      } else {
        const newData = { ...(contact.custom_data || {}), [field]: text };
        await supabase.from('contacts').update({ custom_data: newData }).eq('id', contact.id);
      }
      await supabase.from('conversations').update({ flow_step: captureNodes.length, flow_data: {} }).eq('id', conv.id);
      if (aiNode) {
        replyText = await getAIReply(text, aiNode.sub || 'Eres un asistente amable y breve.', tenantId) || '';
      }
      if (!replyText) replyText = msgNode?.sub || '¡Gracias! Ya tenemos tus datos.';
    } else {
      // Sin capture nodes — flujo normal con IA
      if (aiNode) {
        // Cargar base de conocimiento del tenant
        const { data: tenantData } = await supabase.from('tenants').select('knowledge_base').eq('id', tenantId).single();
        let systemPrompt = aiNode.sub || 'Eres un asistente amable y breve.';
        if (tenantData?.knowledge_base) {
          systemPrompt = `${systemPrompt}\n\nINFORMACIÓN DE LA EMPRESA (usa esto para responder preguntas de clientes):\n${tenantData.knowledge_base}`;
        }
        replyText = await getAIReply(text, systemPrompt, tenantId) || '';
      }
      if (!replyText) replyText = msgNode?.sub || '¡Hola! ¿En qué puedo ayudarte?';
    }

    // Enviar respuesta via Evolution API
    const { data: agent } = await supabase.from('agents')
      .select('*').eq('tenant_id', tenantId).eq('channel','whatsapp').single();

    if (agent?.evolution_instance && replyText) {
      await axios.post(
        `${process.env.EVOLUTION_URL}/message/sendText/${agent.evolution_instance}`,
        { number: phone, text: replyText },
        { headers: { 'apikey': process.env.EVOLUTION_KEY } }
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
