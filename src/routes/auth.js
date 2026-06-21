const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const router = express.Router();

// ─── Limites por plano ───
const PLAN_LIMITS = {
  trial:    { messages: 300,   tokens: 3000   },
  starter:  { messages: 2000,  tokens: 10000  },
  pro:      { messages: 15000, tokens: 50000  },
  business: { messages: 50000, tokens: 150000 },
};

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y password requeridos' });

  const { data: tenant, error } = await supabase
    .from('tenants').select('*').eq('email', email).single();

  if (error || !tenant) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const valid = await bcrypt.compare(password, tenant.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

  // Check if trial expired → mark as blocked
  if (tenant.plan === 'trial' && tenant.trial_ends_at) {
    const expired = new Date() > new Date(tenant.trial_ends_at);
    if (expired) {
      await supabase.from('tenants').update({ plan: 'blocked' }).eq('id', tenant.id);
      tenant.plan = 'blocked';
    }
  }

  const token = jwt.sign(
    { id: tenant.id, email: tenant.email, plan: tenant.plan },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, tenant: { id: tenant.id, name: tenant.name, email: tenant.email, plan: tenant.plan } });
});

// REGISTRO — Trial gratuito 7 días
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email inválido' });

  const hash = await bcrypt.hash(password, 10);

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  const limits = PLAN_LIMITS.trial;

  const { data, error } = await supabase
    .from('tenants')
    .insert([{
      name,
      email: email.toLowerCase().trim(),
      password_hash: hash,
      plan: 'trial',
      trial_ends_at: trialEndsAt.toISOString(),
      message_limit: limits.messages,
      tokens_used: 0
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: 'Email já registrado' });

  const token = jwt.sign(
    { id: data.id, email: data.email, plan: data.plan },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, tenant: { id: data.id, name: data.name, email: data.email, plan: data.plan } });
});

module.exports = router;
