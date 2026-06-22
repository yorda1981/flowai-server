const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const router = express.Router();

// Rate limiting simples por IP
const requestCounts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minuto
  const maxRequests = 60;
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, start: now });
    return next();
  }
  
  const data = requestCounts.get(ip);
  if (now - data.start > windowMs) {
    requestCounts.set(ip, { count: 1, start: now });
    return next();
  }
  
  if (data.count >= maxRequests) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em 1 minuto.' });
  }
  
  data.count++;
  next();
}

const PLAN_TOKENS = { trial:3000, starter:10000, pro:50000, business:150000, free:3000, blocked:0 };

// Palabras clave para detectar intención de agendar
const BOOKING_KEYWORDS = [
  'agendar','agend','marcar','reservar','reserva','appointment','cita',
  'consulta','horário','horario','disponível','disponible','quero marcar',
  'quiero agendar','fazer agendamento','schedule'
];

function detectBookingIntent(text) {
  const lower = text.toLowerCase();
  return BOOKING_KEYWORDS.some(kw => lower.includes(kw));
}

function parseDate(text) {
  // Try to extract date from text like "amanhã", "segunda", "15/07", "15 de julho"
  const lower = text.toLowerCase().trim();
  const today = new Date();
  
  if (lower.includes('amanhã') || lower.includes('mañana') || lower.includes('amanha')) {
    const d = new Date(today); d.setDate(d.getDate()+1);
    return d.toISOString().split('T')[0];
  }
  if (lower.includes('hoje') || lower.includes('hoy')) {
    return today.toISOString().split('T')[0];
  }
  
  const days = { 'segunda':1,'terça':2,'terca':2,'quarta':3,'quinta':4,'sexta':5,'sábado':6,'sabado':6,'domingo':0 };
  for (const [day, num] of Object.entries(days)) {
    if (lower.includes(day)) {
      const d = new Date(today);
      const diff = (num - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }
  }
  
  // Try DD/MM or DD/MM/YYYY
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2,'0');
    const month = dateMatch[2].padStart(2,'0');
    const year = dateMatch[3] ? (dateMatch[3].length===2?'20'+dateMatch[3]:dateMatch[3]) : today.getFullYear();
    return `${year}-${month}-${day}`;
  }
  
  return null;
}

function parseTime(text) {
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(?:h|hrs?|horas?)?(?:\s*(am|pm))?/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const m = timeMatch[2] || '00';
    if (timeMatch[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
    return `${String(h).padStart(2,'0')}:${m}:00`;
  }
  return null;
}

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

async function sendMessage(evolutionInstance, phone, text) {
  await axios.post(
    `${process.env.EVOLUTION_URL}/message/sendText/${evolutionInstance}`,
    { number: phone, text, options: { delay: 1000, presence: 'composing' } },
    { headers: { 'apikey': process.env.EVOLUTION_KEY } }
  );
}

// ─── BOOKING FLOW HANDLER ───
async function handleBookingFlow(conv, contact, text, phone, tenantId, agent) {
  const flowData = conv.flow_data || {};
  const bookingState = flowData.booking || {};
  let replyText = '';

  // Step 0: Ask for service
  if (!bookingState.step) {
    await supabase.from('conversations').update({
      flow_data: { ...flowData, booking: { step: 'service' } }
    }).eq('id', conv.id);
    replyText = `📅 Ótimo! Vou te ajudar a fazer um agendamento.\n\nQual serviço você deseja agendar?`;
  }

  // Step 1: Got service, ask for date
  else if (bookingState.step === 'service') {
    await supabase.from('conversations').update({
      flow_data: { ...flowData, booking: { step: 'date', service: text } }
    }).eq('id', conv.id);
    replyText = `Perfeito! Para *${text}*.\n\n📆 Qual data você prefere?\n_(Ex: amanhã, segunda-feira, 15/07)_`;
  }

  // Step 2: Got date, ask for time
  else if (bookingState.step === 'date') {
    const date = parseDate(text);
    if (!date) {
      replyText = `Não entendi a data. Pode me dizer de outra forma?\n_(Ex: amanhã, segunda-feira, 15/07)_`;
    } else {
      const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
      await supabase.from('conversations').update({
        flow_data: { ...flowData, booking: { ...bookingState, step: 'time', date } }
      }).eq('id', conv.id);
      replyText = `📆 *${dateFormatted}*\n\n🕐 Que horário você prefere?\n_(Ex: 9h, 14:30, 15h)_`;
    }
  }

  // Step 3: Got time, confirm and save
  else if (bookingState.step === 'time') {
    const time = parseTime(text);
    if (!time) {
      replyText = `Não entendi o horário. Pode repetir?\n_(Ex: 9h, 14:30, 15h)_`;
    } else {
      // Save appointment to Supabase
      const { data: appt, error } = await supabase.from('appointments').insert([{
        tenant_id: tenantId,
        contact_name: contact.name,
        phone: contact.phone,
        service: bookingState.service,
        date: bookingState.date,
        time: time,
        duration: 60,
        notes: `Agendado via WhatsApp`,
        status: 'confirmado'
      }]).select().single();

      // Clear booking state
      await supabase.from('conversations').update({
        flow_data: { ...flowData, booking: null }
      }).eq('id', conv.id);

      if (error) {
        replyText = `❌ Houve um erro ao salvar o agendamento. Por favor, tente novamente.`;
      } else {
        const dateFormatted = new Date(bookingState.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
        const timeFormatted = time.substring(0,5);
        replyText = `✅ *Agendamento confirmado!*\n\n📋 *Serviço:* ${bookingState.service}\n📆 *Data:* ${dateFormatted}\n🕐 *Horário:* ${timeFormatted}\n👤 *Nome:* ${contact.name}\n\nTe esperamos! Se precisar cancelar ou remarcar, é só nos avisar. 😊`;
      }
    }
  }

  // Send reply
  if (replyText && agent?.evolution_instance) {
    await sendMessage(agent.evolution_instance, phone, replyText);
    await supabase.from('messages').insert([{
      tenant_id: tenantId, conversation_id: conv.id,
      contact_id: contact.id, content: replyText, direction:'outbound', sent_by:'ai'
    }]);
  }

  return true;
}

// ─── MAIN WEBHOOK ───
router.post('/evolution/:tenantId', async (req, res) => {
  res.sendStatus(200);
  try {
    const { tenantId } = req.params;
    const body = req.body;

    // Verify Evolution API key
    const apikey = req.headers['apikey'] || req.headers['x-api-key'];
    if (!apikey || apikey !== process.env.EVOLUTION_KEY) {
      console.log('Webhook rejeitado: apikey inválida');
      return;
    }

    if (body.event !== 'messages.upsert') return;
    const data = body.data;
    if (!data) return;
    if (data.key?.fromMe) return;
    const remoteJid = data.key?.remoteJid || '';
    if (remoteJid.includes('@g.us')) return;

    const phone = remoteJid.replace('@s.whatsapp.net', '');
    const text = data.message?.conversation ||
                 data.message?.extendedTextMessage?.text || '';
    const senderName = data.pushName || phone;

    if (!phone || !text) return;

    // Check blocked
    const { data: blocked } = await supabase.from('blocked_numbers')
      .select('id').eq('tenant_id', tenantId).eq('phone', phone).maybeSingle();
    if (blocked) return;

    // Get/create contact
    let { data: contact } = await supabase.from('contacts')
      .select('*').eq('tenant_id', tenantId).eq('phone', phone).single();
    if (!contact) {
      const { data: nc } = await supabase.from('contacts')
        .insert([{ tenant_id: tenantId, name: senderName, phone, channel:'whatsapp' }]).select().single();
      contact = nc;
    }

    // Get/create conversation
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

    // Save incoming message
    await supabase.from('messages').insert([{
      tenant_id: tenantId, conversation_id: conv.id,
      contact_id: contact.id, content: text, direction:'inbound', sent_by:'contact'
    }]);

    // If human mode, don't reply
    if (conv.status === 'open') return;

    // Get agent
    const { data: agent } = await supabase.from('agents')
      .select('*').eq('tenant_id', tenantId).eq('channel','whatsapp').single();

    // ─── BOOKING FLOW ───
    const flowData = conv.flow_data || {};
    const isInBookingFlow = flowData.booking && flowData.booking.step;
    const wantsToBook = detectBookingIntent(text);

    if (isInBookingFlow || wantsToBook) {
      await handleBookingFlow(conv, contact, text, phone, tenantId, agent);
      return;
    }

    // ─── REGULAR FLOW ───
    const { data: flows } = await supabase.from('flows')
      .select('*').eq('tenant_id', tenantId).eq('status','active').limit(1);

    if (!flows?.length) {
      if (agent?.evolution_instance) {
        await sendMessage(agent.evolution_instance, phone, '¡Hola! Recibimos tu mensaje. En breve te atendemos.');
      }
      return;
    }

    const flow = flows[0];
    const nodes = flow.nodes || [];
    const currentStep = conv.flow_step || 0;
    const captureNodes = nodes.filter(n => n.type === 'capture');
    const aiNode = nodes.find(n => n.type === 'ai');
    const msgNode = nodes.find(n => n.type === 'message');

    let replyText = '';

    if (captureNodes.length > 0 && currentStep < captureNodes.length) {
      const currentCapture = captureNodes[currentStep];
      if (currentStep > 0 || flowData.capturing) {
        const prevCapture = captureNodes[currentStep - 1] || (flowData.capturing ? captureNodes[0] : null);
        if (prevCapture && flowData.capturing) {
          const field = prevCapture.field || 'custom';
          if (field === 'name') await supabase.from('contacts').update({ name: text }).eq('id', contact.id);
          else if (field === 'email') await supabase.from('contacts').update({ email: text }).eq('id', contact.id);
          else {
            const newData = { ...(contact.custom_data || {}), [field]: text };
            await supabase.from('contacts').update({ custom_data: newData }).eq('id', contact.id);
          }
          const nextStep = currentStep + (flowData.capturing ? 1 : 0);
          if (nextStep >= captureNodes.length) {
            await supabase.from('conversations').update({ flow_step: nextStep, flow_data: {} }).eq('id', conv.id);
            if (aiNode) replyText = await getAIReply(text, aiNode.sub || 'Eres un asistente amable y breve.', tenantId) || '';
            if (!replyText) replyText = msgNode?.sub || '¡Gracias! Ya tenemos tus datos.';
          } else {
            const nextCapture = captureNodes[nextStep];
            replyText = nextCapture.sub || `¿Cuál es tu ${nextCapture.field || 'dato'}?`;
            await supabase.from('conversations').update({ flow_step: nextStep, flow_data: { capturing: true } }).eq('id', conv.id);
          }
        } else {
          replyText = currentCapture.sub || `¿Cuál es tu ${currentCapture.field || 'nombre'}?`;
          await supabase.from('conversations').update({ flow_step: 0, flow_data: { capturing: true } }).eq('id', conv.id);
        }
      } else {
        replyText = currentCapture.sub || `¿Cuál es tu ${currentCapture.field || 'nombre'}?`;
        await supabase.from('conversations').update({ flow_step: 0, flow_data: { capturing: true } }).eq('id', conv.id);
      }
    } else if (flowData.capturing && captureNodes.length > 0) {
      const lastCapture = captureNodes[currentStep] || captureNodes[captureNodes.length - 1];
      const field = lastCapture?.field || 'custom';
      if (field === 'name') await supabase.from('contacts').update({ name: text }).eq('id', contact.id);
      else if (field === 'email') await supabase.from('contacts').update({ email: text }).eq('id', contact.id);
      else {
        const newData = { ...(contact.custom_data || {}), [field]: text };
        await supabase.from('contacts').update({ custom_data: newData }).eq('id', contact.id);
      }
      await supabase.from('conversations').update({ flow_step: captureNodes.length, flow_data: {} }).eq('id', conv.id);
      if (aiNode) replyText = await getAIReply(text, aiNode.sub || 'Eres un asistente amable y breve.', tenantId) || '';
      if (!replyText) replyText = msgNode?.sub || '¡Gracias! Ya tenemos tus datos.';
    } else {
      if (aiNode) {
        const { data: tenantData } = await supabase.from('tenants').select('knowledge_base').eq('id', tenantId).single();
        let systemPrompt = aiNode.sub || 'Eres un asistente amable y breve.';
        if (tenantData?.knowledge_base) {
          systemPrompt = `${systemPrompt}\n\nINFORMACIÓN DE LA EMPRESA:\n${tenantData.knowledge_base}`;
        }
        replyText = await getAIReply(text, systemPrompt, tenantId) || '';
      }
      if (!replyText) replyText = msgNode?.sub || '¡Hola! ¿En qué puedo ayudarte?';
    }

    if (agent?.evolution_instance && replyText) {
      await sendMessage(agent.evolution_instance, phone, replyText);
      await supabase.from('messages').insert([{
        tenant_id: tenantId, conversation_id: conv.id,
        contact_id: contact.id, content: replyText, direction:'outbound', sent_by:'ai'
      }]);
    }
  } catch(e) { console.error('Webhook error:', e.message); }
});

// ─── BLOCKED NUMBERS (com autenticação por token) ───
const jwt = require('jsonwebtoken');

function tenantAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    // Validate that the token matches the tenantId in the URL
    if (decoded.id !== req.params.tenantId) return res.status(403).json({ error: 'Acesso negado' });
    req.tenant = decoded;
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

router.get('/blocked/:tenantId', tenantAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('blocked_numbers')
      .select('*').eq('tenant_id', req.params.tenantId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/blocked/:tenantId', rateLimit, tenantAuth, async (req, res) => {
  try {
    const { phone, reason } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone requerido' });
    const { data, error } = await supabase.from('blocked_numbers')
      .insert([{ tenant_id: req.params.tenantId, phone: phone.trim(), reason: reason||'' }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/blocked/:tenantId/:id', tenantAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('blocked_numbers')
      .delete().eq('id', req.params.id).eq('tenant_id', req.params.tenantId);
    if (error) throw error;
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/whatsapp/:tenantId', async (req, res) => res.sendStatus(200));

module.exports = router;
