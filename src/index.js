require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const flowsRoutes = require('./routes/flows');
const messagesRoutes = require('./routes/messages');
const agentsRoutes = require('./routes/agents');
const aiRoutes = require('./routes/ai');
const webhookRoutes = require('./routes/webhook');
const statsRoutes = require('./routes/stats');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Rutas ───
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/flows', flowsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/webhook', webhookRoutes);

// ─── Health check ───
app.get('/', (req, res) => {
  res.json({ status: 'FlowAI server funcionando ✅', version: '1.0.0' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ FlowAI Server corriendo en puerto ${PORT}`);
});
