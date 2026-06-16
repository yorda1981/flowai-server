const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

// Listar contactos
router.get('/', auth, async (req, res) => {
  const { search } = req.query;
  let query = supabase.from('contacts').select('*').eq('tenant_id', req.tenant.id).order('last_interaction', { ascending: false });
  if (search) query = query.ilike('name', `%${search}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Crear contacto
router.post('/', auth, async (req, res) => {
  const { name, phone, channel, tags, notes } = req.body;
  const { data, error } = await supabase.from('contacts')
    .insert([{ tenant_id: req.tenant.id, name, phone, channel, tags, notes }]).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Actualizar contacto
router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('contacts')
    .update(req.body).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Eliminar contacto
router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('contacts')
    .delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

module.exports = router;
