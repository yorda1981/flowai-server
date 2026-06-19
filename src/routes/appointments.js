const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

// Listar citas
router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('appointments')
    .select('*').eq('tenant_id', req.tenant.id)
    .order('date', { ascending: true })
    .order('time', { ascending: true });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Crear cita
router.post('/', auth, async (req, res) => {
  const { contact_name, phone, service, date, time, duration, notes, status } = req.body;
  const { data, error } = await supabase.from('appointments')
    .insert([{ tenant_id: req.tenant.id, contact_name, phone, service, date, time, duration: duration||60, notes, status: status||'pendiente' }])
    .select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Actualizar cita
router.patch('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('appointments')
    .update(req.body).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Eliminar cita
router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('appointments')
    .delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

module.exports = router;
