const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { conversation_id } = req.query;
  let query = supabase.from('messages').select('*').eq('tenant_id', req.tenant.id).order('created_at');
  if (conversation_id) query = query.eq('conversation_id', conversation_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.get('/conversations', auth, async (req, res) => {
  const { data, error } = await supabase.from('conversations')
    .select('*, contacts(name, phone, channel)').eq('tenant_id', req.tenant.id)
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.get('/conversation/:convId', auth, async (req, res) => {
  const { convId } = req.params;
  const { data, error } = await supabase.from('messages')
    .select('*')
    .eq('tenant_id', req.tenant.id)
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

module.exports = router;
