const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('agents').select('*').eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const { name, channel, zapi_instance, zapi_token, telegram_token } = req.body;
  const { data, error } = await supabase.from('agents')
    .insert([{ tenant_id: req.tenant.id, name, channel, zapi_instance, zapi_token, telegram_token }]).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('agents')
    .update(req.body).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

module.exports = router;
