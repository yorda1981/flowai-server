// NexaAI CRM — agents.js

async function loadAgents(){
  const data=await api('/api/agents')||[];
  const grid=document.getElementById('agents-grid');
  grid.innerHTML=data.map(a=>`
    <div class="agent-card" id="agent-${a.id}">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:44px;height:44px;background:var(--teal-light);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px">
          <i class="ti ti-brand-whatsapp" style="color:var(--teal)"></i>
        </div>
        <div style="flex:1">
          <div style="font-weight:600">${a.name}</div>
          <div style="font-size:12px;color:var(--text2)">WhatsApp · <span id="status-${a.id}" style="color:${a.status==='connected'?'var(--green)':'var(--red)'}">${a.status==='connected'?'Conectado':'Desconectado'}</span></div>
        </div>
        <div class="status-dot ${a.status==='connected'?'':'off'}" id="dot-${a.id}"></div>
      </div>
      <div id="qr-${a.id}"></div>
      <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
        ${a.status==='connected'
          ?`<button class="btn" style="flex:1;justify-content:center;font-size:12px;color:var(--red)" onclick="disconnectAgent('${a.id}')"><i class="ti ti-unlink"></i>Desconectar</button>`
          :`<button class="btn primary" style="flex:1;justify-content:center;font-size:12px" onclick="showQR('${a.id}')"><i class="ti ti-qrcode"></i>Conectar WhatsApp</button>`
        }
        <button class="btn" style="flex:1;justify-content:center;font-size:12px" onclick="checkStatus('${a.id}')"><i class="ti ti-refresh"></i>Verificar</button>
        <button class="btn" style="font-size:12px;color:var(--red);padding:6px 10px" onclick="deleteAgent('${a.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('')+`
    <div class="agent-card agent-add" onclick="addAgent()">
      <i class="ti ti-plus" style="font-size:30px;color:var(--text3)"></i>
      <div style="font-size:13px;text-align:center">Añadir agente<br><span style="font-size:11px">WhatsApp · Telegram</span></div>
    </div>`;
}

async function addAgent(){
  const name=prompt('Nombre del agente (ej: Soporte WhatsApp):');if(!name)return;
  await api('/api/agents','POST',{name,channel:'whatsapp'});
  showToast('Agente creado. Ahora conecta tu WhatsApp ✓');
  loadAgents();
}

async function showQR(agentId){
  const qrDiv=document.getElementById('qr-'+agentId);
  qrDiv.innerHTML=`<div style="text-align:center;padding:16px;color:var(--text2);font-size:13px"><i class="ti ti-loader-2" style="font-size:24px"></i><br>Generando QR code...</div>`;
  try {
    const data=await api('/api/agents/'+agentId+'/qrcode');
    if(data?.base64){
      qrDiv.innerHTML=`
        <div style="text-align:center;padding:12px;background:#f9fafb;border-radius:8px;margin:10px 0">
          <img src="${data.base64}" style="width:200px;height:200px;border-radius:8px">
          <div style="font-size:12px;color:var(--text2);margin-top:8px">Escanea con WhatsApp → Dispositivos vinculados</div>
        </div>`;
      // Auto-verificar cada 5 segundos hasta conectar
      let tries = 0;
      const interval = setInterval(async () => {
        tries++;
        const st = await api('/api/agents/'+agentId+'/status');
        if(st?.status==='connected'){
          clearInterval(interval);
          showToast('✅ WhatsApp conectado exitosamente!');
          loadAgents();
        }
        if(tries >= 12) clearInterval(interval); // parar después de 1 minuto
      }, 5000);
    } else if(data?.code){
      qrDiv.innerHTML=`
        <div style="text-align:center;padding:12px;background:#f9fafb;border-radius:8px;margin:10px 0">
          <div style="font-size:11px;font-family:monospace;word-break:break-all;background:#fff;padding:8px;border-radius:6px;border:1px solid var(--border)">${data.code}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:6px">Copia este código en WhatsApp → Vincular dispositivo</div>
        </div>`;
    } else {
      qrDiv.innerHTML=`<div style="font-size:13px;color:var(--text2);padding:10px;text-align:center">Generando QR... presiona Verificar cuando hayas escaneado.</div>`;
    }
  } catch(e) {
    qrDiv.innerHTML=`<div style="font-size:13px;color:var(--red);padding:10px">Error al obtener QR. Intenta de nuevo.</div>`;
  }
}

async function checkStatus(agentId){
  showToast('Verificando conexión...');
  const data=await api('/api/agents/'+agentId+'/status');
  if(data?.status==='connected'){
    showToast('✅ WhatsApp conectado exitosamente!');
    loadAgents();
  } else {
    showToast('⏳ Aún no conectado. Escanea el QR e intenta de nuevo.');
  }
}

async function disconnectAgent(agentId){
  if(!confirm('¿Desconectar este WhatsApp?'))return;
  await api('/api/agents/'+agentId+'/disconnect','POST');
  showToast('WhatsApp desconectado');loadAgents();
}

async function deleteAgent(agentId){
  if(!confirm('¿Eliminar este agente?'))return;
  await api('/api/agents/'+agentId,'DELETE');
  showToast('Agente eliminado');loadAgents();
}
