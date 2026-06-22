// NexaAI CRM — dashboard.js

async function loadDashboard() {
  const stats = await api('/api/stats'); if (!stats) return;
  document.getElementById('m-messages').textContent = (stats.total_messages||0).toLocaleString();
  document.getElementById('m-contacts').textContent = (stats.total_contacts||0).toLocaleString();
  document.getElementById('m-convs').textContent = (stats.total_conversations||0).toLocaleString();
  document.getElementById('m-flows').textContent = (stats.flows||[]).filter(f=>f.status==='active').length;
  initOnboarding(stats);
  ['mc1','mc2','mc3','mc4'].forEach((id,i)=>{
    const el=document.getElementById(id); if(!el)return;
    const d=[[40,55,48,70,65,80,75],[30,45,40,55,60,58,72],[2,2,3,3,3,3,3],[1,1,1,1,2,2,2]][i];
    const max=Math.max(...d);
    el.innerHTML=d.map(v=>`<div class="mini-bar" style="height:${Math.round(v/max*100)}%"></div>`).join('');
  });
  const flowsEl=document.getElementById('dash-flows-list');
  flowsEl.innerHTML=(stats.flows||[]).length===0
    ?'<div style="font-size:13px;color:var(--text2);padding:10px 0">No hay flujos aún. <a href="#" onclick="nav(\'flows\',null)" style="color:var(--blue)">Crea el primero</a></div>'
    :(stats.flows||[]).slice(0,4).map(f=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><i class="ti ti-topology-star" style="color:var(--blue);font-size:16px"></i><div style="flex:1"><div style="font-size:13px;font-weight:500">${f.name}</div><div style="font-size:11px;color:var(--text2)">${f.executions||0} ejecuciones</div></div><span class="badge ${f.status==='active'?'green':'amber'}">${f.status==='active'?'Activo':'Borrador'}</span></div>`).join('');
  const contactsData=await api('/api/contacts');
  const contactsEl=document.getElementById('dash-contacts-list');
  contactsEl.innerHTML=(!contactsData||contactsData.length===0)
    ?'<div style="font-size:13px;color:var(--text2);padding:10px 0">No hay contactos aún.</div>'
    :contactsData.slice(0,4).map(c=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div class="avatar" style="width:28px;height:28px;font-size:11px">${(c.name||'?').substring(0,2).toUpperCase()}</div><div style="flex:1"><div style="font-size:13px;font-weight:500">${c.name||'Sin nombre'}</div><div style="font-size:11px;color:var(--text2)">${c.phone||''}</div></div></div>`).join('');
  const hourly=[{v:42,l:'8h'},{v:87,l:'9h'},{v:145,l:'10h'},{v:198,l:'11h'},{v:234,l:'12h'},{v:210,l:'13h'},{v:178,l:'14h'},{v:156,l:'15h'},{v:189,l:'16h'},{v:224,l:'17h'},{v:167,l:'18h'},{v:98,l:'19h'}];
  const max=Math.max(...hourly.map(d=>d.v));
  document.getElementById('hourly-chart').innerHTML=hourly.map(d=>`<div class="bar" style="height:${Math.round(d.v/max*100)}%"><span class="bar-val">${d.v}</span><span class="bar-label">${d.l}</span></div>`).join('');
}
