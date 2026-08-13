// NexaAI CRM — followup.js
// Cron de follow-up automático: roda a cada 30 minutos
// Verifica conversas paradas e envia mensagens de acompanhamento

const supabase = require('../supabase');
const axios    = require('axios');

async function sendMessage(evolutionInstance, phone, text) {
  await axios.post(
    `${process.env.EVOLUTION_URL}/message/sendText/${evolutionInstance}`,
    { number: phone, text, options: { delay: 1000, presence: 'composing' } },
    { headers: { 'apikey': process.env.EVOLUTION_KEY } }
  );
}

async function runFollowUp() {
  try {
    console.log('[FollowUp] Verificando conversas paradas...');

    // Buscar todas as regras ativas agrupadas por tenant
    const { data: rules, error: rulesErr } = await supabase
      .from('followup_rules')
      .select('*')
      .eq('enabled', true)
      .order('step', { ascending: true });

    if (rulesErr || !rules?.length) return;

    // Agrupar regras por tenant
    const byTenant = {};
    rules.forEach(r => {
      if (!byTenant[r.tenant_id]) byTenant[r.tenant_id] = [];
      byTenant[r.tenant_id].push(r);
    });

    for (const [tenantId, tenantRules] of Object.entries(byTenant)) {
      // Buscar agente ativo do tenant
      const { data: agent } = await supabase
        .from('agents')
        .select('evolution_instance')
        .eq('tenant_id', tenantId)
        .eq('channel', 'whatsapp')
        .single();

      if (!agent?.evolution_instance) continue;

      // Buscar conversas em modo bot (não humano, não fechadas)
      const { data: convs } = await supabase
        .from('conversations')
        .select('*, contacts(phone, name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'bot')
        .not('last_contact_at', 'is', null);

      if (!convs?.length) continue;

      const now = new Date();

      for (const conv of convs) {
        const phone = conv.contacts?.phone;
        if (!phone) continue;

        const lastContact = new Date(conv.last_contact_at);
        const hoursElapsed = (now - lastContact) / (1000 * 60 * 60);
        const currentStep  = conv.followup_step || 0;

        // Verificar qual regra aplicar
        const nextRule = tenantRules.find(r => r.step === currentStep + 1);
        if (!nextRule) continue; // Sem mais follow-ups configurados

        // Verificar se já passou o tempo da próxima regra
        if (hoursElapsed < nextRule.delay_hours) continue;

        // Verificar se já enviamos este step (evitar duplicata)
        if (conv.followup_step >= nextRule.step) continue;

        try {
          const contactName = conv.contacts?.name || '';
          const personalizedMessage = nextRule.message
            .replace(/\{nome\}/gi, contactName || 'tudo bem')
            .replace(/\{name\}/gi, contactName || 'there');

          const maxStep = Math.max(...tenantRules.map(r => r.step));
          const newStatus = nextRule.step >= maxStep ? 'closed' : 'bot';

          // Reservamos el paso ANTES de enviar: si dos ejecuciones corrieran casi
          // al mismo tiempo (ej. por un redeploy solapado), la segunda va a ver
          // que este paso ya fue tomado (condición de arriba: conv.followup_step
          // >= nextRule.step) y no va a duplicar el envío.
          const { data: claimed } = await supabase.from('conversations')
            .update({
              followup_step:    nextRule.step,
              followup_sent_at: now.toISOString(),
              status:           newStatus
            })
            .eq('id', conv.id)
            .lt('followup_step', nextRule.step)
            .select();

          if (!claimed?.length) continue; // otro proceso ya lo tomó, no reenviar

          // Enviar mensagem
          await sendMessage(agent.evolution_instance, phone, personalizedMessage);

          // Salvar mensagem no histórico
          await supabase.from('messages').insert([{
            tenant_id: tenantId,
            conversation_id: conv.id,
            contact_id: conv.contact_id,
            content: personalizedMessage,
            direction: 'outbound',
            sent_by: 'followup'
          }]);

          console.log(`[FollowUp] Tenant ${tenantId} | Contato ${phone} | Step ${nextRule.step} enviado${newStatus==='closed'?' → conversa fechada':''}`);

        } catch(e) {
          console.error(`[FollowUp] Erro ao enviar para ${phone}:`, e.message);
        }
      }
    }

    console.log('[FollowUp] Verificação concluída.');
  } catch(e) {
    console.error('[FollowUp] Erro geral:', e.message);
  }
}

// Resetar follow-up step quando contato responde
// Chamar esta função no webhook quando chegar mensagem inbound
async function resetFollowUp(conversationId) {
  await supabase.from('conversations').update({
    followup_step:    0,
    followup_sent_at: null,
    last_contact_at:  new Date().toISOString()
  }).eq('id', conversationId);
}

// Atualizar last_contact_at quando mensagem chega
async function updateLastContact(conversationId) {
  await supabase.from('conversations').update({
    last_contact_at: new Date().toISOString()
  }).eq('id', conversationId);
}

function startFollowUpCron() {
  const INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
  console.log('[FollowUp] Cron iniciado — verificação a cada 30 minutos');
  // Nota: NO corremos runFollowUp() inmediatamente al arrancar. Si lo hiciéramos,
  // cada redeploy del servidor (que reinicia el proceso) dispararía un envío
  // duplicado de follow-ups antes de que la base de datos alcance a registrar
  // el envío anterior — esto fue justo lo que causó mensajes repetidos durante
  // los deploys de hoy. Ahora solo corre según el intervalo programado.
  setInterval(runFollowUp, INTERVAL_MS);
}

module.exports = { startFollowUpCron, resetFollowUp, updateLastContact };
