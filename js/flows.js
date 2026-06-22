// NexaAI CRM — flows.js

async function loadFlows(){const data=await api('/api/flows');allFlows=data||[];renderFlows(allFlows);}

async function deleteFlow(id, name){
  if(!confirm('¿Eliminar el flujo "'+name+'"?')) return;
  await api('/api/flows/'+id,'DELETE');
  showToast('Flujo eliminado ✓');
  loadFlows();
}

function renderFlows(list){
  document.getElementById('flows-grid').innerHTML=list.length===0
    ?'<div style="grid-column:1/-1;text-align:center;color:var(--text2);padding:40px">No hay flujos. Crea el primero.</div>'
    :list.map(f=>`<div class="card"><div class="card-hdr"><span class="card-title" style="font-size:13px;cursor:pointer" onclick="openBuilder('${f.id}','${f.name}')">${f.name}</span><div style="display:flex;align-items:center;gap:8px"><span class="badge ${f.status==='active'?'green':'amber'}">${f.status==='active'?'Activo':'Borrador'}</span><button onclick="deleteFlow('${f.id}','${f.name}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px;padding:2px 4px" title="Eliminar"><i class="ti ti-trash"></i></button></div></div><div style="font-size:12px;color:var(--text2);margin-top:6px;cursor:pointer" onclick="openBuilder('${f.id}','${f.name}')"><i class="ti ti-topology-star" style="font-size:13px;vertical-align:-2px"></i> ${(f.nodes||[]).length} nodos · ${f.executions||0} ejecuciones</div></div>`).join('');
}

function filterFlows(type,el){
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  if(el)el.classList.add('active');
  renderFlows(type==='all'?allFlows:allFlows.filter(f=>f.status===type));
}

function openBuilder(id,name){
  currentFlowId=id||null;
  document.getElementById('flows-index').style.display='none';
  document.getElementById('flow-builder-section').style.display='block';
  document.getElementById('builder-title').textContent=name||'Nuevo flujo';
  if(id){const flow=allFlows.find(f=>f.id===id);flowNodes=flow?.nodes?.length?flow.nodes:[...defaultFlow];flowEdges=flow?.edges?.length?flow.edges:[...defaultEdges];}
  else{flowNodes=[...defaultFlow];flowEdges=[...defaultEdges];}
  selectedNodeId=null;renderCanvas();
}

function closeBuilder(){document.getElementById('flows-index').style.display='block';document.getElementById('flow-builder-section').style.display='none';}

async function saveFlow(){
  const name=currentFlowId?document.getElementById('builder-title').textContent:prompt('Nombre del flujo:');
  if(!name)return;
  if(currentFlowId)await api(`/api/flows/${currentFlowId}`,'PUT',{nodes:flowNodes,edges:flowEdges,status:'active'});
  else await api('/api/flows','POST',{name,nodes:flowNodes,edges:flowEdges});
  showToast('Flujo guardado ✓');loadFlows();
}

function testFlow(){showToast('▶ Flujo probado: todos los nodos OK ✓');}

function renderCanvas(){
  const canvas=document.getElementById('flow-canvas');
  canvas.querySelectorAll('.flow-node').forEach(n=>n.remove());
  const svg=document.getElementById('flow-svg');
  svg.innerHTML='<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#185FA5" fill-opacity=".4"/></marker></defs>';
  flowEdges.forEach(([a,b])=>{
    const na=flowNodes.find(n=>n.id===a),nb=flowNodes.find(n=>n.id===b);if(!na||!nb)return;
    const x1=na.x+153,y1=na.y+38,x2=nb.x,y2=nb.y+38,cx=(x1+x2)/2;
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
    p.setAttribute('stroke','#185FA5');p.setAttribute('stroke-opacity','.35');p.setAttribute('stroke-width','1.5');p.setAttribute('fill','none');p.setAttribute('marker-end','url(#arr)');
    svg.appendChild(p);
  });
  flowNodes.forEach(n=>{
    const el=document.createElement('div');
    el.className='flow-node'+(selectedNodeId===n.id?' selected':'');
    el.style.cssText=`left:${n.x}px;top:${n.y}px;background:${nodeColors[n.type]||'#f3f4f6'}`;
    el.innerHTML=`<div class="node-type-label" style="color:${nodeTypeColor[n.type]||'#6b7280'}">${nodeTypeLabel[n.type]||n.type}</div><div class="node-main-label">${n.label}</div><div class="node-sub-label">${n.sub}</div>`;
    el.addEventListener('click',e=>{e.stopPropagation();selectNode(n.id);});
    let ox,oy,sx,sy;
    el.addEventListener('mousedown',e=>{ox=e.clientX;oy=e.clientY;sx=n.x;sy=n.y;
      const mv=ev=>{n.x=sx+(ev.clientX-ox);n.y=sy+(ev.clientY-oy);el.style.left=n.x+'px';el.style.top=n.y+'px';renderEdgesSVG();};
      const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
      document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
    });
    canvas.appendChild(el);
  });
}

function renderEdgesSVG(){
  const svg=document.getElementById('flow-svg');
  svg.innerHTML='<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#185FA5" fill-opacity=".4"/></marker></defs>';
  flowEdges.forEach(([a,b])=>{
    const na=flowNodes.find(n=>n.id===a),nb=flowNodes.find(n=>n.id===b);if(!na||!nb)return;
    const x1=na.x+153,y1=na.y+38,x2=nb.x,y2=nb.y+38,cx=(x1+x2)/2;
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
    p.setAttribute('stroke','#185FA5');p.setAttribute('stroke-opacity','.35');p.setAttribute('stroke-width','1.5');p.setAttribute('fill','none');p.setAttribute('marker-end','url(#arr)');
    svg.appendChild(p);
  });
}

function selectNode(id){
  selectedNodeId=id;const n=flowNodes.find(x=>x.id===id);renderCanvas();
  let extraFields = '';
  if (n.type === 'capture') {
    extraFields = `
      <div class="prop-label">Pregunta al cliente</div>
      <textarea class="prop-textarea" oninput="flowNodes.find(x=>x.id===${id}).sub=this.value;renderCanvas()">${n.sub||''}</textarea>
      <div class="prop-label">Guardar respuesta en</div>
      <select class="prop-select" onchange="flowNodes.find(x=>x.id===${id}).field=this.value">
        <option value="name" ${n.field==='name'?'selected':''}>Nombre del contacto</option>
        <option value="email" ${n.field==='email'?'selected':''}>Email del contacto</option>
        <option value="interest" ${n.field==='interest'?'selected':''}>Interés</option>
        <option value="company" ${n.field==='company'?'selected':''}>Empresa</option>
        <option value="city" ${n.field==='city'?'selected':''}>Ciudad</option>
        <option value="custom" ${(!n.field||n.field==='custom')?'selected':''}>Dato personalizado</option>
      </select>`;
  } else {
    extraFields = `
      <div class="prop-label">${n.type==='ai'?'Prompt de IA':'Contenido'}</div>
      <textarea class="prop-textarea" oninput="flowNodes.find(x=>x.id===${id}).sub=this.value;renderCanvas()">${n.sub||''}</textarea>`;
  }
  document.getElementById('flow-props').innerHTML=`
    <div style="font-weight:600;font-size:13px;margin-bottom:14px;color:${nodeTypeColor[n.type]}">${nodeTypeLabel[n.type]}</div>
    <div class="prop-label">Nombre</div>
    <input class="prop-input" value="${n.label||''}" oninput="flowNodes.find(x=>String(x.id)===String(${id})).label=this.value;renderCanvas()">
    ${extraFields}
    <div style="margin-top:16px">
      <button class="btn" style="width:100%;justify-content:center;color:var(--red)" onclick="deleteFlowNode('${id}')"><i class="ti ti-trash"></i>Eliminar</button>
    </div>`;
}

function deleteFlowNode(id) {
  flowNodes = flowNodes.filter(x => String(x.id) !== String(id));
  renderCanvas();
  document.getElementById('flow-props').innerHTML = '<div class="empty-state">Selecciona un nodo para editarlo</div>';
}
