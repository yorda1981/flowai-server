// NexaAI CRM — routes/products.js
const express = require('express');
const supabase = require('../supabase');
const auth     = require('../middleware/auth');
const router   = express.Router();

// GET /api/products
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products').select('*')
      .eq('tenant_id', req.tenant.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/products
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, price, category, image_url, in_stock } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const { data, error } = await supabase.from('products').insert([{
      tenant_id: req.tenant.id,
      name: name.trim(),
      description: description || '',
      price: price ? Number(price) : null,
      category: category || '',
      image_url: image_url || '',
      in_stock: in_stock !== false
    }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/products/:id
router.patch('/:id', auth, async (req, res) => {
  try {
    const { name, description, price, category, image_url, in_stock } = req.body;
    const updates = {};
    if (name       !== undefined) updates.name        = name.trim();
    if (description!== undefined) updates.description = description;
    if (price      !== undefined) updates.price       = price ? Number(price) : null;
    if (category   !== undefined) updates.category    = category;
    if (image_url  !== undefined) updates.image_url   = image_url;
    if (in_stock   !== undefined) updates.in_stock    = in_stock;

    const { data, error } = await supabase.from('products')
      .update(updates)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenant.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/products/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('products')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenant.id);
    if (error) throw error;
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
