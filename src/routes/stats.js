// NexaAI CRM — routes/stats.js
const express = require('express');
const supabase = require('../supabase');
const auth     = require('../middleware/auth');
const router   = express.Router();

router.get('/', auth, async (req, res) => {
  const tenantId = req.tenant.id;
  const now      = new Date();
  const today    = new Date(now); today.setHours(0,0,0,0);
  const week     = new Date(now); week.setDate(now.getDate() - 6); week.setHours(0,0,0,0);
  const month    = new Date(now); month.setDate(1); month.setHours(0,0,0,0);

  const [
    contacts, messages, flows, conversations,
    todayMsgs, weekMsgs, openConvs, botConvs,
    pipeline, monthMsgs
  ] = await Promise.all([
    supabase.from('contacts').select('id', { count:'exact' }).eq('tenant_id', tenantId),
    supabase.from('messages').select('id', { count:'exact' }).eq('tenant_id', tenantId),
    supabase.from('flows').select('id,name,executions,status').eq('tenant_id', tenantId),
    supabase.from('conversations').select('id', { count:'exact' }).eq('tenant_id', tenantId),

    // Mensagens hoje
    supabase.from('messages').select('id', { count:'exact' })
      .eq('tenant_id', tenantId).gte('created_at', today.toISOString()),

    // Mensagens últimos 7 dias por dia
    supabase.from('messages').select('created_at,direction')
      .eq('tenant_id', tenantId).gte('created_at', week.toISOString()),

    // Conversas abertas (humano)
    supabase.from('conversations').select('id', { count:'exact' })
      .eq('tenant_id', tenantId).eq('status', 'open'),

    // Conversas no bot
    supabase.from('conversations').select('id', { count:'exact' })
      .eq('tenant_id', tenantId).eq('status', 'bot'),

    // Pipeline: contatos por etapa
    supabase.from('contacts').select('pipeline_stage')
      .eq('tenant_id', tenantId).not('pipeline_stage', 'is', null),

    // Mensagens este mês
    supabase.from('messages').select('id', { count:'exact' })
      .eq('tenant_id', tenantId).gte('created_at', month.toISOString()),
  ]);

  // ── Mensagens por dia (últimos 7 dias) ──
  const dailyMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dailyMap[d.toISOString().split('T')[0]] = { inbound: 0, outbound: 0 };
  }
  (weekMsgs.data || []).forEach(m => {
    const day = m.created_at?.split('T')[0];
    if (dailyMap[day]) {
      if (m.direction === 'inbound')  dailyMap[day].inbound++;
      if (m.direction === 'outbound') dailyMap[day].outbound++;
    }
  });
  const daily = Object.entries(dailyMap).map(([date, v]) => ({
    date,
    label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'numeric' }),
    inbound:  v.inbound,
    outbound: v.outbound,
    total:    v.inbound + v.outbound
  }));

  // ── Pipeline por etapa ──
  const stageCount = { lead:0, interesado:0, negociacion:0, cliente:0 };
  (pipeline.data || []).forEach(c => {
    if (stageCount[c.pipeline_stage] !== undefined) stageCount[c.pipeline_stage]++;
  });
  const totalPipeline = Object.values(stageCount).reduce((a,b) => a+b, 0);
  const conversionRate = totalPipeline > 0
    ? Math.round((stageCount.cliente / totalPipeline) * 100)
    : 0;

  // ── Taxa de automação ──
  const totalConvs = (conversations.count || 0);
  const botPct = totalConvs > 0
    ? Math.round(((botConvs.count || 0) / totalConvs) * 100)
    : 0;

  res.json({
    // Métricas gerais
    total_contacts:      contacts.count || 0,
    total_messages:      messages.count || 0,
    total_conversations: totalConvs,
    messages_today:      todayMsgs.count || 0,
    messages_month:      monthMsgs.count || 0,
    open_conversations:  openConvs.count || 0,
    bot_conversations:   botConvs.count || 0,
    bot_automation_pct:  botPct,
    conversion_rate:     conversionRate,

    // Pipeline
    pipeline: stageCount,
    pipeline_total: totalPipeline,

    // Gráfico 7 dias
    daily,

    // Flows
    flows: flows.data || []
  });
});

module.exports = router;
