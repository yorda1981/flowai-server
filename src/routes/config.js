const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

// Obtener base de conocimiento
router.get('/knowledge-base', auth, async (req, res) => {
  const { data, error } = await supabase.from('tenants')
    .select('knowledge_base').eq('id', req.tenant.id).single();
  if (error) return res.status(500).json({ error });
  res.json({ knowledge_base: data?.knowledge_base || '' });
});

// Guardar base de conocimiento
router.post('/knowledge-base', auth, async (req, res) => {
  const { knowledge_base } = req.body;
  const { error } = await supabase.from('tenants')
    .update({ knowledge_base }).eq('id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

module.exports = router;
