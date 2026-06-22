// NexaAI CRM — routes/followup_api.js
const express  = require('express');
const supabase = require('../supabase');
const jwt      = require('jsonwebtoken');
const router   = express.Router();

// Middleware: extrai tenantId do JWT
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    req.tenantId = decoded.tenant_id || decoded.id;
    next();
  } catch(e) { res.status(401).json({ error: 'Token inválido' }); }
}

// GET /api/followup
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('followup_rules').select('*')
      .eq('tenant_id', req.tenantId).order('step', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/followup — salva todas as regras (substitui)
router.post('/', auth, async (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules deve ser array' });

    await supabase.from('followup_rules').delete().eq('tenant_id', req.tenantId);

    const toInsert = rules
      .map((r, i) => ({
        tenant_id:   req.tenantId,
        step:        i + 1,
        delay_hours: Number(r.delay_hours) || 1,
        message:     (r.message || '').trim(),
        enabled:     r.enabled !== false
      }))
      .filter(r => r.message);

    if (toInsert.length > 0) {
      const { error } = await supabase.from('followup_rules').insert(toInsert);
      if (error) throw error;
    }

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
