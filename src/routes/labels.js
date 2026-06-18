const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

// Listar etiquetas del tenant
router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('labels')
    .select('*').eq('tenant_id', req.tenant.id).order('name');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Crear etiqueta
router.post('/', auth, async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name requerido' });
  const { data, error } = await supabase.from('labels')
    .insert([{ tenant_id: req.tenant.id, name, color: color || 'gray' }]).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Eliminar etiqueta
router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('labels')
    .delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

module.exports = router;
