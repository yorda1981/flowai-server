const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const router = express.Router();

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y password requeridos' });

  const { data: tenant, error } = await supabase
    .from('tenants').select('*').eq('email', email).single();

  if (error || !tenant) return res.status(401).json({ error: 'Credenciales incorrectas' });

  // Para demo, aceptamos password "123456"
  const valid = password === '123456' || await bcrypt.compare(password, tenant.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const token = jwt.sign(
    { id: tenant.id, email: tenant.email, plan: tenant.plan },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, tenant: { id: tenant.id, name: tenant.name, email: tenant.email, plan: tenant.plan } });
});

// REGISTRO
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });

  const hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('tenants').insert([{ name, email, password_hash: hash }]).select().single();

  if (error) return res.status(400).json({ error: 'Email ya registrado' });

  const token = jwt.sign(
    { id: data.id, email: data.email, plan: data.plan },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, tenant: { id: data.id, name: data.name, email: data.email, plan: data.plan } });
});

module.exports = router;
