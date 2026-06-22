// NexaAI CRM — messages.js

async function loadConversations(){
  const data = await api('/api/messages/conversations') || [];
  const seen = new Map();
  data.forEach(c => {
    const phone = c.contacts?.phone || c.id;
    if (!seen.has(phone)) seen.set(phone, c);
  });
  allConvs = Array.from(seen.values());
  renderConvList(allConvs);
}

function renderConvList(data) {
  document.getElementById('conv-list').innerHTML = data.length === 0
    ? '<div style="padding:20px;text-align:center;color:var(--text2);font-size:13px">No hay conversaciones aún</div>'
    : data.map(c => `
      <div id="conv-item-${c.id}" onclick="openConv('${c.id}','${(c.contacts?.name||'?').replace(/'/g,"\\'")}','${c.contacts?.phone||''}','${c.status||'bot'}')"
        style="padding:12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;transition:background .15s"
        onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background=activeConvId==='${c.id}'?'#e8f0fb':''">
        <div class="avatar">${(c.contacts?.name||'?').substring(0,2).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500">${c.contacts?.name||'Desconocido'}</div>
          <div style="font-size:11px;color:var(--text2)">${c.contacts?.phone||''}</div>
        </div>
        <span class="badge ${c.status==='open'?'green':c.status==='bot'?'blue':'gray'}" style="font-size:10px">${c.status||'bot'}</span>
      </div>`).join('');
}

function searchConvs(q) {
  const filtered = allConvs.filter(c =>
    (c.contacts?.name||'').toLowerCase().includes(q.toLowerCase()) ||
    (c.contacts?.phone||'').includes(q)
  );
  renderConvList(filtered);
}

async function openConv(convId, name, phone, status) {
  activeConvId = convId;
  activePhone = phone;
  activeStatus = status;
  // Highlight selected
  document.querySelectorAll('[id^="conv-item-"]').forEach(el => el.style.background = '');
  const item = document.getElementById('conv-item-' + convId);
  if (item) item.style.background = '#e8f0fb';

  // Mostrar panel chat
  document.getElementById('chat-empty').style.display = 'none';
  const active = document.getElementById('chat-active');
  active.style.display = 'flex';

  // Header
  document.getElementById('chat-avatar').textContent = name.substring(0,2).toUpperCase();
  document.getElementById('chat-name').textContent = name;
  document.getElementById('chat-phone').textContent = phone;
  document.getElementById('chat-status').textContent = status === 'bot' ? 'Bot activo' : status === 'open' ? '👤 Humano' : 'Cerrada';
  document.getElementById('chat-status').className = 'badge ' + (status==='bot'?'blue':status==='open'?'green':'gray');
  document.getElementById('btn-take').style.display = status === 'bot' ? '' : 'none';
  document.getElementById('btn-bot').style.display = status === 'open' ? '' : 'none';

  // Cargar mensajes
  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:10px">Cargando mensajes...</div>';

  const data = await api('/api/messages/conversation/' + convId) || [];

  if (data.length === 0) {
    msgs.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:20px">No hay mensajes aún</div>';
    return;
  }

  msgs.innerHTML = data.map(m => {
    const isOut = m.direction === 'outbound';
    const time = new Date(m.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
    return `
      <div style="display:flex;justify-content:${isOut?'flex-end':'flex-start'}">
        <div style="max-width:70%;padding:8px 12px;border-radius:${isOut?'12px 12px 2px 12px':'12px 12px 12px 2px'};background:${isOut?'#dcf8c6':'#fff'};box-shadow:0 1px 2px rgba(0,0,0,.1);font-size:13px;line-height:1.5">
          ${m.content}
          <div style="font-size:10px;color:${isOut?'#6b9e6b':'var(--text3)'};text-align:right;margin-top:3px">${time} ${isOut?'<i class="ti ti-checks" style="font-size:11px"></i>':''}</div>
        </div>
      </div>`;
  }).join('');
  msgs.scrollTop = msgs.scrollHeight;
}

async function takeConv() {
  if (!activeConvId) return;
  await api(`/api/messages/conversation/${activeConvId}/take`, 'POST');
  activeStatus = 'open';
  document.getElementById('chat-status').textContent = '👤 Humano';
  document.getElementById('chat-status').className = 'badge green';
  document.getElementById('btn-take').style.display = 'none';
  document.getElementById('btn-bot').style.display = '';
  showToast('✅ Tomaste control de la conversación');
  loadConversations();
}

async function botConv() {
  if (!activeConvId) return;
  await api(`/api/messages/conversation/${activeConvId}/bot`, 'POST');
  activeStatus = 'bot';
  document.getElementById('chat-status').textContent = 'Bot activo';
  document.getElementById('chat-status').className = 'badge blue';
  document.getElementById('btn-take').style.display = '';
  document.getElementById('btn-bot').style.display = 'none';
  showToast('🤖 Bot retomó la conversación');
  loadConversations();
}

async function closeConv() {
  if (!activeConvId) return;
  if (!confirm('¿Cerrar esta conversación?')) return;
  await api(`/api/messages/conversation/${activeConvId}/close`, 'POST');
  activeStatus = 'closed';
  document.getElementById('chat-status').textContent = 'Cerrada';
  document.getElementById('chat-status').className = 'badge gray';
  document.getElementById('btn-take').style.display = 'none';
  document.getElementById('btn-bot').style.display = 'none';
  showToast('Conversación cerrada');
  loadConversations();
}

async function sendManualMsg() {
  const inp = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text || !activeConvId || !activePhone) return;
  inp.value = '';
  inp.disabled = true;
  const msgs = document.getElementById('chat-messages');
  const time = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
  const tempId = 'tmp-' + Date.now();
  msgs.innerHTML += `
    <div id="${tempId}" style="display:flex;justify-content:flex-end">
      <div style="max-width:70%;padding:8px 12px;border-radius:12px 12px 2px 12px;background:#dcf8c6;box-shadow:0 1px 2px rgba(0,0,0,.1);font-size:13px;line-height:1.5">
        ${text}
        <div style="font-size:10px;color:#6b9e6b;text-align:right;margin-top:3px">${time} <i id="icon-${tempId}" class="ti ti-clock" style="font-size:11px"></i></div>
      </div>
    </div>`;
  msgs.scrollTop = msgs.scrollHeight;
  try {
    await api('/api/campaigns/send', 'POST', { phone: activePhone, message: text });
    const ic = document.getElementById('icon-' + tempId);
    if (ic) ic.className = 'ti ti-checks';
  } catch(e) {
    const tmp = document.getElementById(tempId);
    if (tmp) tmp.querySelector('div').style.background = '#ffe5e5';
    showToast('❌ Error al enviar');
  }
  inp.disabled = false;
  inp.focus();
}

async function sendAI(){
  const inp=document.getElementById('ai-input');const text=inp.value.trim();if(!text)return;
  inp.value='';const msgs=document.getElementById('ai-msgs');
  msgs.innerHTML+=`<div class="msg-row user"><div class="msg-avatar-sm" style="background:var(--blue-light)"><span style="font-size:11px;font-weight:700;color:var(--blue)">${(USER?.name||'U').substring(0,2).toUpperCase()}</span></div><div class="msg-bubble user-b">${text}</div></div>`;
  const tid='t'+Date.now();
  msgs.innerHTML+=`<div class="msg-row" id="${tid}"><div class="msg-avatar-sm" style="background:var(--purple-light)"><i class="ti ti-sparkles" style="color:var(--purple);font-size:14px"></i></div><div class="msg-bubble ai-b"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
  msgs.scrollTop=msgs.scrollHeight;
  aiHistory.push({role:'user',content:text});
  try{
    const data=await api('/api/ai/chat','POST',{messages:aiHistory});
    const reply=data?.reply||'Sin respuesta';
    aiHistory.push({role:'assistant',content:reply});
    document.getElementById(tid).querySelector('.msg-bubble').innerHTML=reply.replace(/\n/g,'<br>');
  }catch{document.getElementById(tid).querySelector('.msg-bubble').textContent='Error al conectar con IA.';}
  msgs.scrollTop=msgs.scrollHeight;
}
