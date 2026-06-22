// NexaAI CRM — utils.js

function showScreen(name) {
  document.getElementById('screen-login').classList.toggle('hidden', name !== 'login');
  document.getElementById('screen-register').classList.toggle('hidden', name !== 'register');
}

function selectPlan(plan, el) {
  selectedPlan = plan;
  document.querySelectorAll('.plan-opt').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  if (!email || !pass) { err.textContent = 'Completa todos los campos'; return; }
  btn.textContent = 'Entrando...'; btn.disabled = true; err.textContent = '';
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Credenciales incorrectas');
    TOKEN = data.token; USER = data.tenant;
    localStorage.setItem('nexaai_token', TOKEN);
    localStorage.setItem('nexaai_user', JSON.stringify(USER));
    showApp();
  } catch(e) {
    err.textContent = e.message;
  }
  btn.textContent = 'Entrar'; btn.disabled = false;
}

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const btn = document.getElementById('reg-btn');
  const err = document.getElementById('reg-error');
  if (!name || !email || !pass) { err.textContent = 'Completa todos los campos'; return; }
  if (pass.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }
  btn.textContent = 'Creando cuenta...'; btn.disabled = true; err.textContent = '';
  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear cuenta');
    TOKEN = data.token; USER = data.tenant;
    localStorage.setItem('nexaai_token', TOKEN);
    localStorage.setItem('nexaai_user', JSON.stringify(USER));
    showToast('¡Cuenta creada! Tienes 7 días de trial gratuito 🎉');
    showApp();
  } catch(e) {
    err.textContent = e.message;
  }
  btn.textContent = 'Crear cuenta'; btn.disabled = false;
}

function showApp() {
  showScreen('none');
  document.getElementById('app-sidebar').style.display = 'flex';
  document.getElementById('app-main').style.display = 'flex';
  if (USER) {
    document.getElementById('user-name').textContent = USER.name;
    document.getElementById('user-email').textContent = USER.email;
    document.getElementById('user-avatar').textContent = (USER.name||'U').substring(0,2).toUpperCase();
    document.getElementById('plan-badge').textContent = (USER.plan||'FREE').toUpperCase();
    document.getElementById('current-plan-label').textContent = 'Plan ' + (USER.plan||'starter') + ' activo';
    // Show trial banner if on trial
    if (USER.plan === 'trial') {
      const existingBanner = document.getElementById('trial-banner');
      if (!existingBanner) {
        const banner = document.createElement('div');
        banner.id = 'trial-banner';
        banner.style.cssText = 'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;text-align:center;padding:8px 16px;font-size:12px;font-weight:500;flex-shrink:0';
        banner.innerHTML = "🎁 Trial gratuito activo — 500 mensajes disponibles · <a onclick=\"nav('plans',document.querySelector('[onclick*=plans]'))\" style=\"color:#fff;font-weight:700;cursor:pointer;text-decoration:underline\">Ver planes</a>";
        const main = document.getElementById('app-main');
        main.insertBefore(banner, main.firstChild);
      }
    }
  }
  loadDashboard();
  checkTrialStatus();
}

async function checkTrialStatus() {
  if (!USER || USER.plan !== 'blocked') return;
  // Show blocked overlay
  let overlay = document.getElementById('blocked-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'blocked-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:var(--surface);border-radius:var(--radius-lg);padding:40px;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:48px;margin-bottom:16px">⏰</div>
      <div style="font-size:20px;font-weight:700;margin-bottom:8px">Tu trial ha expirado</div>
      <div style="font-size:14px;color:var(--text2);margin-bottom:24px">Tu período de prueba gratuita de 7 días ha finalizado. Elige un plan para continuar usando NexaAI CRM.</div>
      <button class="auth-btn" style="border-radius:var(--radius)" onclick="document.getElementById('blocked-overlay').remove();nav('plans',document.querySelector('[onclick*=plans]'))">Ver Planes 🚀</button>
      <div style="font-size:11px;color:var(--text3);margin-top:12px">Contacta soporte si tienes dudas</div>
    </div>`;
    document.body.appendChild(overlay);
  }
}

function doLogout() {
  localStorage.removeItem('nexaai_token');
  localStorage.removeItem('nexaai_user');
  TOKEN = null; USER = null;
  document.getElementById('app-sidebar').style.display = 'none';
  document.getElementById('app-main').style.display = 'none';
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value = '';
  showScreen('login');
}

async function api(path, method='GET', body=null) {
  const opts = { method, headers: {'Authorization':`Bearer ${TOKEN}`,'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (res.status === 401) { doLogout(); return null; }
  return res.json();
}

function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+id)?.classList.add('active');
  if (el) el.classList.add('active');
  const titles={dashboard:'Dashboard',agents:'Agentes',flows:'Flujos',contacts:'Contactos CRM',messages:'Mensajes',agenda:'Agenda',blocked:'Números Bloqueados',campaigns:'Campañas',stats:'Estadísticas',plans:'Planes',ai:'Asistente IA',config:'Configuración',tutorials:'Tutoriais & Modelos de Fluxo'};
  document.getElementById('page-title').textContent = titles[id]||id;
  if (id==='contacts') loadContacts();
  if (id==='agenda') loadAgenda();
  if (id==='flows') loadFlows();
  if (id==='stats') loadStats();
  if (id==='agents') loadAgents();
  if (id==='messages') loadConversations();
  if (id==='blocked') loadBlocked();
  if (id==='campaigns') loadCampaigns();
  if (id==='config') { loadTokenUsage(); loadKnowledgeBase(); }
  if (id==='plans') loadPlanStatus();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function initOnboarding(stats) {
  const dismissed = localStorage.getItem('nexaai-onboarding-dismissed');
  if (dismissed) return;

  const hasAgent = stats.total_conversations > 0 || stats.total_messages > 0;
  const hasFlow = (stats.flows||[]).length > 0;
  const hasContact = stats.total_contacts > 0;
  const hasAI = false; // checked via config
  const hasCampaign = false; // no easy way to check yet

  const steps = [
    { id: 'step-agent', done: hasAgent },
    { id: 'step-flow', done: hasFlow },
    { id: 'step-contact', done: hasContact },
    { id: 'step-ai', done: hasAI },
    { id: 'step-campaign', done: hasCampaign },
  ];

  const completed = steps.filter(s => s.done).length;
  const total = steps.length;
  const pct = Math.round(completed / total * 100);

  // If all done, hide
  if (completed === total) {
    localStorage.setItem('nexaai-onboarding-dismissed', '1');
    return;
  }

  document.getElementById('onboarding-section').style.display = 'block';
  document.getElementById('onboarding-bar').style.width = pct + '%';
  document.getElementById('onboarding-progress-text').textContent = 
    completed === 0 ? 'Completa los pasos para empezar' :
    `${completed} de ${total} pasos completados · ${pct}%`;

  steps.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    if (s.done) {
      el.classList.add('done');
      el.querySelector('.step-icon').innerHTML = '<i class="ti ti-check"></i>';
    }
  });
}

function dismissOnboarding() {
  localStorage.setItem('nexaai-onboarding-dismissed', '1');
  document.getElementById('onboarding-section').style.display = 'none';
}

async function useTutorialFlow(type) {
  const flow = TUTORIAL_FLOWS[type];
  if (!flow) return;
  if (!confirm(`Criar o fluxo "${flow.name}" automaticamente?`)) return;
  
  try {
    const res = await fetch(API + '/api/flows', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body: JSON.stringify({
        name: flow.name,
        status: 'active',
        nodes: flow.nodes,
        edges: []
      })
    });
    if (res.ok) {
      showToast('Fluxo "' + flow.name + '" criado com sucesso! ✅');
      setTimeout(() => nav('flows', document.querySelector('[onclick*=flows]')), 1500);
    } else {
      showToast('Erro ao criar fluxo. Tente novamente.');
    }
  } catch(e) {
    showToast('Erro ao criar fluxo.');
  }
}

function toggleDark(){
  const dark=document.body.classList.toggle('dark');
  localStorage.setItem('nexaai-dark', dark?'1':'0');
  document.getElementById('dark-icon').className=dark?'ti ti-sun':'ti ti-moon';
}

function changeLang(lang){
  localStorage.setItem('nexaai-lang', lang);
  // Use Google Translate cookie method
  const domain=location.hostname==='localhost'?'localhost':'.'+location.hostname.split('.').slice(-2).join('.');
  document.cookie=`googtrans=/es/${lang};path=/;domain=${domain}`;
  document.cookie=`googtrans=/es/${lang};path=/`;
  location.reload();
}
