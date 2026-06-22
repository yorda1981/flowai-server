// NexaAI CRM — routes/followup_api.js
// API para gerenciar regras de follow-up automático

const express  = require('express');
const supabase = require('../supabase');
const router   = express.Router();

// GET /api/followup — listar regras do tenant
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('followup_rules')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('step', { ascending: true });
    if(error) throw error;
    res.json(data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/followup — criar/atualizar regras (substitui todas as do tenant)
router.post('/', async (req, res) => {
  try {
    const { rules } = req.body; // Array de { step, delay_hours, message, enabled }
    if(!Array.isArray(rules)) return res.status(400).json({ error: 'rules deve ser array' });

    // Deletar regras antigas e inserir novas
    await supabase.from('followup_rules').delete().eq('tenant_id', req.tenantId);

    if(rules.length > 0) {
      const toInsert = rules.map((r, i) => ({
        tenant_id:   req.tenantId,
        step:        i + 1,
        delay_hours: Number(r.delay_hours) || 1,
        message:     r.message || '',
        enabled:     r.enabled !== false
      })).filter(r => r.message.trim());

      if(toInsert.length > 0) {
        const { error } = await supabase.from('followup_rules').insert(toInsert);
        if(error) throw error;
      }
    }

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/followup/toggle — ativar/desativar tudo
router.patch('/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    await supabase.from('followup_rules')
      .update({ enabled })
      .eq('tenant_id', req.tenantId);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
