const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('flows').select('*')
    .eq('tenant_id', req.tenant.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const { name, nodes, edges } = req.body;
  const { data, error } = await supabase.from('flows')
    .insert([{ tenant_id: req.tenant.id, name, nodes: nodes||[], edges: edges||[], status: 'draft' }]).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('flows')
    .update({ ...req.body, updated_at: new Date() })
    .eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('flows')
    .delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

module.exports = router;
