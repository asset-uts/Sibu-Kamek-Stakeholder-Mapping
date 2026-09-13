const svg=document.getElementById('svg'), NS="http://www.w3.org/2000/svg";
const PAD={l:110,r:40,t:40,b:90}, W=1000,H=780;
const GX0=PAD.l, GY0=PAD.t, GX1=W-PAD.r, GY1=H-PAD.b;

let S={items:[], links:[]}; 
let mode="move", sel=null, linkFrom=null, sessionId=null;
let userName=null;
let hist=[], redoStack=[];
let rtChannel=null, lastMove=0;
const myCursorId = crypto.randomUUID();
const myColor = '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
const peers = {};

function updateHistoryButtons(){document.getElementById('bUndo').disabled=!hist.length;document.getElementById('bRedo').disabled=!redoStack.length;}
function snap(){ hist.push(JSON.stringify(S)); redoStack=[]; if(hist.length>50)hist.shift(); updateHistoryButtons(); }
async function restoreSnapshot(snapshot){
  S=JSON.parse(snapshot);sel=null;linkFrom=null;draw();
  const updates = S.items.map(i => ({id: i.id, session_id: sessionId, name: i.name, category: i.cat, x: i.x, y: i.y, note: i.note}));
  await supabaseClient.from('stakeholders').upsert(updates);
  await touchSession();
}
async function undo(){
  if(!hist.length)return;
  redoStack.push(JSON.stringify(S));
  await restoreSnapshot(hist.pop());
  updateHistoryButtons();
}
async function redo(){
  if(!redoStack.length)return;
  hist.push(JSON.stringify(S));
  await restoreSnapshot(redoStack.pop());
  updateHistoryButtons();
}

function uid(){ return crypto.randomUUID(); }
function notify(message){
 const toast=document.getElementById('toast');
 toast.textContent=message; toast.classList.add('show');
 clearTimeout(notify.timer); notify.timer=setTimeout(()=>toast.classList.remove('show'),3000);
}
function withTimeout(promise, milliseconds){
  return Promise.race([
    promise,
    new Promise((_, reject)=>setTimeout(()=>reject(new Error('Request timed out')),milliseconds))
  ]);
}
async function touchSession(id=sessionId){
  if(!id)return;
  const {error}=await supabaseClient.from('sessions').update({updated_at:new Date().toISOString()}).eq('id',id);
  if(error) console.error('Could not update session timestamp:',error);
}
const el=(t,a={},p=svg)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e;};
const hidden=new Set();

function draw(){
 Array.from(svg.children).forEach(c => { if(c.id !== 'cursorsLayer') svg.removeChild(c); });
 
 el('rect',{x:GX0,y:GY0,width:GX1-GX0,height:GY1-GY0,fill:'#F4F1E8',stroke:'#DCD2BE','stroke-width':2});
 const mx=(GX0+GX1)/2, my=(GY0+GY1)/2;
 el('line',{x1:mx,y1:GY0,x2:mx,y2:GY1,stroke:'#DCD2BE','stroke-width':1.5});
 el('line',{x1:GX0,y1:my,x2:GX1,y2:my,stroke:'#DCD2BE','stroke-width':1.5});
 const q=[["KEEP SATISFIED",GX0+18,GY0+30],["MANAGE CLOSELY",mx+18,GY0+30],["MONITOR",GX0+18,my+30],["KEEP INFORMED",mx+18,my+30]];
 q.forEach(([t,x,y])=>{const e=el('text',{x,y,'font-family':'Georgia,serif','font-size':13,'font-weight':'bold',fill:'#B5AC97','letter-spacing':2});e.textContent=t;});
 let a=el('text',{x:(GX0+GX1)/2,y:GY1+42,'text-anchor':'middle','font-family':'Georgia,serif','font-size':15,'font-weight':'bold',fill:'#5C6659','letter-spacing':2});a.textContent="INTEREST / STAKE  →";
 a=el('text',{x:GX0-56,y:(GY0+GY1)/2,'text-anchor':'middle','font-family':'Georgia,serif','font-size':15,'font-weight':'bold',fill:'#5C6659','letter-spacing':2,transform:`rotate(-90 ${GX0-56} ${(GY0+GY1)/2})`});a.textContent="POWER  →";
 a=el('text',{x:GX0,y:GY1+66,'font-family':'Georgia,serif','font-size':11.5,fill:'#A79C88','font-style':'italic'});a.textContent="low";
 a=el('text',{x:GX1,y:GY1+66,'text-anchor':'end','font-family':'Georgia,serif','font-size':11.5,fill:'#A79C88','font-style':'italic'});a.textContent="high";
 
 const defs=el('defs');
 [['ah','#6B6455']].forEach(([id,c])=>{
   const m=el('marker',{id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'},defs);
   el('path',{d:'M0 1 L10 5 L0 9 z',fill:c},m);});
 
 S.links.forEach(L=>{
  const A=S.items.find(i=>i.id===L.a), B=S.items.find(i=>i.id===L.b);
  if(!A||!B||A.x===null||B.x===null||hidden.has(A.cat)||hidden.has(B.cat)) return;
  el('line',{x1:A.x,y1:A.y,x2:B.x,y2:B.y,stroke:'#6B6455','stroke-width':1.6,opacity:.65,'marker-end':'url(#ah)'});
  const hit=el('line',{x1:A.x,y1:A.y,x2:B.x,y2:B.y,stroke:'transparent','stroke-width':16,style:'cursor:pointer'});
  el('title',{},hit).textContent='Click to remove this influence line ('+A.name+' → '+B.name+')';
  hit.addEventListener('pointerdown', async e => {
    e.stopPropagation();
    if(mode==='link' || confirm('Remove the influence line from '+A.name+' to '+B.name+'?')){
      snap(); S.links = S.links.filter(x=>x.id!==L.id); draw();
      await supabaseClient.from('influence_links').delete().eq('id', L.id);
      await touchSession();
    }});
 });
 
 S.items.forEach(it=>{
  if(it.x===null||hidden.has(it.cat))return;
  const g=el('g',{'data-id':it.id,class:'node',style:'cursor:pointer'});
  el('circle',{cx:it.x,cy:it.y,r:sel===it.id?11:8,fill:CATS[it.cat][1],stroke:sel===it.id?'#24413A':'#fff','stroke-width':sel===it.id?3:2},g);
  const t=el('text',{x:it.x+14,y:it.y+4,'font-family':'Georgia,serif','font-size':12.5,fill:'#24413A'},g);
  t.textContent=it.name.length>34?it.name.slice(0,32)+'…':it.name;
  const bb=8+7*Math.min(it.name.length,34);
  if(it.x+bb>GX1){t.setAttribute('x',it.x-14);t.setAttribute('text-anchor','end');}
  g.addEventListener('pointerdown',e=>onDown(e,it));
 });

 let cLayer = document.getElementById('cursorsLayer');
 if(!cLayer){ cLayer = el('g', {id: 'cursorsLayer'}, null); }
 svg.appendChild(cLayer);

 renderTray(); renderLegend(); renderDetail();
 document.getElementById('stats').textContent=`${S.items.filter(i=>i.x!==null).length} placed · ${S.items.filter(i=>i.x===null).length} not placed · ${S.links.length} influence lines`;
}

function renderLegend(){
 const d=document.getElementById('legend'); d.innerHTML="";
 CATS.forEach(([n,c],i)=>{const r=document.createElement('div');r.className='legend'+(hidden.has(i)?' off':'');
  r.innerHTML=`<span class="dot" style="background:${c}"></span><span>${n}</span>`;
  r.onclick=()=>{hidden.has(i)?hidden.delete(i):hidden.add(i);draw();};d.appendChild(r);});
}

function renderTray(){
 const d=document.getElementById('tray'); d.innerHTML="";
 const u=S.items.filter(i=>i.x===null);
 document.getElementById('unplacedCount').textContent=`(${u.length})`;
 u.forEach(it=>{const r=document.createElement('div');r.className='chip tray-item';r.draggable=true;
  r.innerHTML=`<span class="dot" style="background:${CATS[it.cat][1]}"></span><span>${it.name}</span><button class="tray-menu" title="More actions">⋮</button>`;
  r.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',it.id));d.appendChild(r);});
 d.querySelectorAll('.tray-menu').forEach(menu=>menu.onclick=e=>{
   e.stopPropagation();
   const id=[...d.children].find(row=>row===e.currentTarget.parentElement)?.querySelector('.dot') ? e.currentTarget.parentElement.dataset.id : null;
   const target=S.items.find(item=>item.id===id);
   if(target&&confirm(`Delete ${target.name}?`)){snap();S.items=S.items.filter(item=>item.id!==target.id);S.links=S.links.filter(link=>link.a!==target.id&&link.b!==target.id);draw();supabaseClient.from('stakeholders').delete().eq('id',target.id);supabaseClient.from('influence_links').delete().eq('session_id',sessionId).or(`source_id.eq.${target.id},target_id.eq.${target.id}`);touchSession();}
 });
 d.querySelectorAll('.tray-item').forEach((row,index)=>row.dataset.id=u[index].id);
}

function renderDetail(){
 const d=document.getElementById('detail');
 const it=S.items.find(i=>i.id===sel);
 if(!it){d.innerHTML='<p class="hint">Nothing selected. Click a stakeholder on the grid.</p>';return;}
 d.innerHTML=`<label>Name</label><input type="text" id="dName" value="${it.name.replace(/"/g,'&quot;')}">
  <label>Group</label><select id="dCat">${CATS.map((c,i)=>`<option value="${i}" ${i===it.cat?'selected':''}>${c[0]}</option>`).join('')}</select>
  <label>Notes</label><textarea id="dNote">${it.note||''}</textarea>
  `;
 
 document.getElementById('dName').onchange = async e => { it.name=e.target.value; draw(); await supabaseClient.from('stakeholders').update({name: it.name}).eq('id', it.id); await touchSession(); };
 document.getElementById('dCat').onchange = async e => { it.cat=+e.target.value; draw(); await supabaseClient.from('stakeholders').update({category: it.cat}).eq('id', it.id); await touchSession(); };
 document.getElementById('dNote').onchange = async e => { it.note=e.target.value; await supabaseClient.from('stakeholders').update({note: it.note}).eq('id', it.id); await touchSession(); };
 
}

function pt(e){const r=svg.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}}
function clamp(p){return{x:Math.max(GX0+8,Math.min(GX1-8,p.x)),y:Math.max(GY0+8,Math.min(GY1-8,p.y))}}
let drag=null;

async function onDown(e,it){
 e.stopPropagation();
 e.preventDefault();
 if(mode==='link'){ 
   if(!linkFrom){ linkFrom=it.id; sel=it.id; draw(); } 
   else if(linkFrom!==it.id){
     snap(); 
     const newLink = {id: crypto.randomUUID(), a: linkFrom, b: it.id};
     S.links.push(newLink); linkFrom=null; draw();
     await supabaseClient.from('influence_links').insert({id: newLink.id, session_id: sessionId, source_id: newLink.a, target_id: newLink.b});
     await touchSession();
   } 
   return; 
 }
 sel=it.id; snap();
 drag={it,which: 'n'};
 svg.setPointerCapture(e.pointerId); draw();
}

svg.addEventListener('pointermove', e => {
 if(drag){
   const p = clamp(pt(e));
   drag.it.x=p.x; drag.it.y=p.y;
   draw();
 }
 
 const now = Date.now();
 if (now - lastMove > 250 && rtChannel) {
   lastMove = now;
   const cp = pt(e);
   rtChannel.send({ type: 'broadcast', event: 'cursor', payload: { id: myCursorId, name: userName, x: cp.x, y: cp.y, color: myColor } });
 }
});

async function finishDrag(e){
 if(!drag)return;
 const d=drag.it;drag=null;
 const tray=document.getElementById('tray').getBoundingClientRect();
 if(e.clientX>=tray.left&&e.clientX<=tray.right&&e.clientY>=tray.top&&e.clientY<=tray.bottom){
   snap();d.x=d.y=null;sel=null;draw();
   await supabaseClient.from('stakeholders').update({x:null,y:null}).eq('id',d.id);
   await touchSession();
 } else {
   await supabaseClient.from('stakeholders').update({x:d.x,y:d.y}).eq('id',d.id);
   await touchSession();
 }
}
svg.addEventListener('pointerup', finishDrag);
document.addEventListener('pointerup', finishDrag);
document.addEventListener('keydown',e=>{
 const tag=e.target.tagName.toLowerCase();
 if((e.key==='Backspace'||e.key==='Delete')&&!['input','textarea','select'].includes(tag)&&sel){
   const it=S.items.find(item=>item.id===sel);if(!it||it.x===null)return;
   e.preventDefault();snap();it.x=it.y=null;sel=null;draw();
   supabaseClient.from('stakeholders').update({x:null,y:null}).eq('id',it.id);touchSession();
 }
});
svg.addEventListener('pointerdown', ()=>{ if(mode!=='link'){sel=null; linkFrom=null; draw();} });
svg.addEventListener('dragover', e=>e.preventDefault());
svg.addEventListener('drop', async e => {
 e.preventDefault(); const id=e.dataTransfer.getData('text/plain');
 const it=S.items.find(i=>i.id===id); if(!it) return;
 snap(); const p=clamp(pt(e)); it.x=p.x; it.y=p.y; sel=id; draw();
 await supabaseClient.from('stakeholders').update({x: p.x, y: p.y}).eq('id', id);
 await touchSession();
});

function setMode(m){
 mode=m; linkFrom=null;
 ['mMove','mLink'].forEach(id=>document.getElementById(id).classList.remove('on'));
 document.getElementById({move:'mMove',link:'mLink'}[m]).classList.add('on');
}
document.getElementById('bUndo').onclick=undo;
document.getElementById('bRedo').onclick=redo;
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}
  if(e.key==='Escape'&&linkFrom){linkFrom=null;draw();}
});
document.getElementById('mMove').onclick=()=>setMode('move');
document.getElementById('mLink').onclick=()=>{setMode('link');alert('Click one stakeholder, then another, to draw an influence line.');};
document.getElementById('mAdd').onclick = async () => {
 const n=prompt('Name of the stakeholder'); if(!n) return; snap();
 const newItem = {id: uid(), name: n, cat: 0, x: null, y: null, note: ""};
 S.items.push(newItem); draw();
 await supabaseClient.from('stakeholders').insert({ id: newItem.id, session_id: sessionId, name: n, category: 0, note: "" });
 await touchSession();
};

function exportJson(){dl(new Blob([JSON.stringify(S,null,1)],{type:'application/json'}),'stakeholder-map.json');}
function exportCsv(){
 const rows=[['Name','Group','Interest 0-100','Power 0-100','Quadrant','Notes']];
 S.items.forEach(i=>{const ix=i.x===null?'':Math.round((i.x-GX0)/(GX1-GX0)*100), ip=i.y===null?'':Math.round((GY1-i.y)/(GY1-GY0)*100);
  let q='';if(i.x!==null){q=(ip>50?'High power':'Low power')+' / '+(ix>50?'high interest':'low interest')}
  rows.push([i.name,CATS[i.cat][0],ix,ip,q,(i.note||'').replace(/\n/g,' ')]);});
 dl(new Blob([rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')],{type:'text/csv'}),'stakeholder-map.csv');
}
function exportPng(){
 const s=new XMLSerializer().serializeToString(svg);
 const img=new Image(); img.onload=()=>{
  const c=document.createElement('canvas');c.width=W*2;c.height=H*2;
  const x=c.getContext('2d');x.fillStyle='#FBF8F2';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
  c.toBlob(b=>dl(b,'stakeholder-map.png'));};
 img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(s)));
}
function dl(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}

function renderPeerCursor(p) {
  let layer = document.getElementById('cursorsLayer');
  if(!layer) return;
  let c = document.getElementById('cursor-'+p.id);
  if(!c) {
    c = el('g', {id: 'cursor-'+p.id, style: 'transition: transform 0.25s linear; pointer-events: none;'}, layer);
    el('path', {
      d: 'M0,0 L0,17 L4.5,12.5 L8,20 L10.5,19 L7,11.5 L13,11.5 Z', 
      fill: p.color, 
      stroke: '#fff', 
      'stroke-width': 1.5,
      'stroke-linejoin': 'round'
    }, c);
    const label=el('text',{x:16,y:18,'font-family':'Georgia,serif','font-size':12,fill:p.color,stroke:'#FBF8F2','stroke-width':3,'paint-order':'stroke'},c);
    label.textContent=p.name;
  }
  const label=c.querySelector('text');
  if(label) label.textContent=p.name;
  c.style.transform = `translate(${p.x}px, ${p.y}px)`;
}


let currentAuthSession = null;
let sessionIsEphemeral = false;
let cleanupTimer = null;
let channelJoined = false;

async function removeEphemeralSession() {
  if (!sessionIsEphemeral || !sessionId) return;
  const links = await supabaseClient.from('influence_links').delete().eq('session_id', sessionId);
  const items = await supabaseClient.from('stakeholders').delete().eq('session_id', sessionId);
  const session = await supabaseClient.from('sessions').delete().eq('id', sessionId).eq('is_ephemeral', true);
  if (!links.error && !items.error && !session.error) { notify('This temporary guest session has expired.'); window.location.replace('index.html'); }
}
function scheduleEphemeralCleanup() {
  if (!sessionIsEphemeral || cleanupTimer) return;
  cleanupTimer = setTimeout(async () => {
    cleanupTimer = null;
    const state = rtChannel?.presenceState() || {};
    const count = Object.values(state).reduce((total, entries) => total + entries.length, 0);
    if (!count) await removeEphemeralSession();
  }, 45000);
}
function cancelEphemeralCleanup() { if (cleanupTimer) { clearTimeout(cleanupTimer); cleanupTimer = null; } }
async function initMapping() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('session') || params.get('code');
  if (!raw) { window.location.replace(isAdminSession(currentAuthSession) ? 'dashboard.html' : 'index.html'); return; }
  sessionId = await resolveSessionInput(raw);
  const { data: session, error: sessionError } = await supabaseClient.from('sessions').select('id,name,join_code,is_ephemeral').eq('id', sessionId).single();
  if (sessionError) throw sessionError;
  sessionIsEphemeral = session.is_ephemeral === true;
  document.getElementById('sessionName').value = session.join_code || sessionId;
  document.getElementById('sessionTitle').value = session.name || 'New Session';
  const { data: st, error: stakeholderError } = await supabaseClient.from('stakeholders').select('*').eq('session_id', sessionId);
  if (stakeholderError) throw stakeholderError;
  const { data: ln, error: linkError } = await supabaseClient.from('influence_links').select('*').eq('session_id', sessionId);
  if (linkError) throw linkError;
  S.items = (st || []).map(item => ({ id: item.id, name: item.name, cat: item.category, x: item.x, y: item.y, note: item.note || '' }));
  S.links = (ln || []).map(link => ({ id: link.id, a: link.source_id, b: link.target_id }));
  rtChannel = supabaseClient.channel(`session-${sessionId}`, { config: { presence: { key: myCursorId } } });
  rtChannel.on('presence', { event: 'sync' }, () => {
    const state = rtChannel.presenceState();
    const count = Object.values(state).reduce((total, entries) => total + entries.length, 0);
    if (count) cancelEphemeralCleanup();
    else scheduleEphemeralCleanup();
  });
  rtChannel.on('presence', { event: 'leave' }, () => { const state = rtChannel.presenceState(); const count = Object.values(state).reduce((total, entries) => total + entries.length, 0); if (!count) scheduleEphemeralCleanup(); });
  rtChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'stakeholders', filter: `session_id=eq.${sessionId}` }, payload => {
    if (payload.eventType === 'INSERT' && !S.items.find(item => item.id === payload.new.id)) S.items.push({ id: payload.new.id, name: payload.new.name, cat: payload.new.category, x: payload.new.x, y: payload.new.y, note: payload.new.note || '' });
    if (payload.eventType === 'UPDATE') { const item = S.items.find(entry => entry.id === payload.new.id); if (item) Object.assign(item, { name: payload.new.name, cat: payload.new.category, x: payload.new.x, y: payload.new.y, note: payload.new.note || '' }); }
    if (payload.eventType === 'DELETE') S.items = S.items.filter(item => item.id !== payload.old.id);
    draw();
  });
  rtChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'influence_links', filter: `session_id=eq.${sessionId}` }, payload => {
    if (payload.eventType === 'INSERT' && !S.links.find(link => link.id === payload.new.id)) S.links.push({ id: payload.new.id, a: payload.new.source_id, b: payload.new.target_id });
    if (payload.eventType === 'DELETE') S.links = S.links.filter(link => link.id !== payload.old.id);
    draw();
  });
  rtChannel.on('broadcast', { event: 'cursor' }, ({ payload }) => { if (!payload || payload.id === myCursorId || !payload.name) return; peers[payload.id] = { ...payload, lastSeen: Date.now() }; renderPeerCursor(payload); });
  const status = await new Promise(resolve => { rtChannel.subscribe(async value => { if (value === 'SUBSCRIBED') { const state = rtChannel.presenceState(); const count = Object.values(state).reduce((total, entries) => total + entries.length, 0); if (count >= 8) { rtChannel.unsubscribe(); resolve('FULL'); return; } await rtChannel.track({ name: userName, color: myColor }); channelJoined = true; resolve('OK'); } else if (value === 'CHANNEL_ERROR' || value === 'TIMED_OUT') resolve('ERROR'); }); });
  if (status === 'FULL') throw new Error('This session is full.');
  if (status !== 'OK') throw new Error('Could not connect to the live session.');
  draw();
  setInterval(() => { const now = Date.now(); Object.keys(peers).forEach(id => { if (now - peers[id].lastSeen > 5000) { document.getElementById(`cursor-${id}`)?.remove(); delete peers[id]; } }); }, 2000);
}

document.getElementById('bHome').onclick = async () => { const { data } = await supabaseClient.auth.getSession(); window.location.replace(isAdminSession(data.session) ? 'dashboard.html' : 'index.html'); };
document.getElementById('sessionTitle').onblur = async e => {
 const name=e.target.value.trim(); if(!name)return;
 e.target.value=name;
 const result=await supabaseClient.from('sessions').update({name,updated_at:new Date().toISOString()}).eq('id',sessionId);
 if(result.error)notify('Could not rename this session.');
};
document.getElementById('sessionTitle').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}};
document.getElementById('bJoin').onclick = async () => { const value = document.getElementById('sessionName').value.trim(); if (!value) return notify('Enter a session code.'); try { const id = await resolveSessionInput(value); window.location.replace(`mapping.html?session=${encodeURIComponent(id)}`); } catch (error) { notify(error.message); } };
document.getElementById('bImport').onclick = () => document.getElementById('importFile').click();
let pendingImport=null;
document.getElementById('importFile').onchange = async event => {
 const file=event.target.files[0];event.target.value='';if(!file)return;
 try{
  const value=JSON.parse(await file.text());
  if(!Array.isArray(value.items)||!Array.isArray(value.links))throw new Error('The JSON must contain items and links arrays.');
  pendingImport=value;document.getElementById('importChoice').classList.remove('hidden');
 }catch(error){notify(error.message);console.error(error);}
};
async function applyImport(modeName){
 const value=pendingImport;if(!value)return;
 const ids=new Set();
 for(const item of value.items){if(!item||typeof item.id!=='string'||ids.has(item.id)||typeof item.name!=='string'||!Number.isInteger(item.cat)||item.cat<0||item.cat>=CATS.length||(item.x!==null&&typeof item.x!=='number')||(item.y!==null&&typeof item.y!=='number'))throw new Error('The JSON contains an invalid stakeholder item.');ids.add(item.id);}
 for(const link of value.links)if(!link||!ids.has(link.a)||!ids.has(link.b))throw new Error('The JSON contains an invalid influence link.');
 snap();
 if(modeName==='overwrite'){
  const links=await supabaseClient.from('influence_links').delete().eq('session_id',sessionId);if(links.error)throw links.error;
  const items=await supabaseClient.from('stakeholders').delete().eq('session_id',sessionId);if(items.error)throw items.error;
  S={items:[],links:[]};
 }
 const map=new Map(),items=value.items.map(item=>{const id=uuid();map.set(item.id,id);return{id,session_id:sessionId,name:item.name,category:item.cat,x:item.x,y:item.y,note:item.note||''};});
 if(items.length){const result=await supabaseClient.from('stakeholders').insert(items);if(result.error)throw result.error;}
 const links=value.links.map(link=>({id:uuid(),session_id:sessionId,source_id:map.get(link.a),target_id:map.get(link.b)}));
 if(links.length){const result=await supabaseClient.from('influence_links').insert(links);if(result.error)throw result.error;}
 const importedItems=items.map(item=>({id:item.id,name:item.name,cat:item.category,x:item.x,y:item.y,note:item.note}));
 const importedLinks=links.map(link=>({id:link.id,a:link.source_id,b:link.target_id}));
 if(modeName==='overwrite')S={items:importedItems,links:importedLinks};
 else {S.items.push(...importedItems);S.links.push(...importedLinks);}
 draw();await touchSession();document.getElementById('importChoice').classList.add('hidden');pendingImport=null;
}
document.getElementById('importOverwrite').onclick=()=>applyImport('overwrite').catch(error=>{notify(error.message);console.error(error);});
document.getElementById('importMerge').onclick=()=>applyImport('merge').catch(error=>{notify(error.message);console.error(error);});
document.getElementById('importCancel').onclick=()=>{pendingImport=null;document.getElementById('importChoice').classList.add('hidden');};
document.getElementById('exportOptions').querySelectorAll('button').forEach(button=>button.onclick=()=>{
 ({json:exportJson,png:exportPng,csv:exportCsv}[button.dataset.export])();
 document.getElementById('exportOptions').classList.add('hidden');
});
document.getElementById('bExport').onclick=e=>{e.stopPropagation();document.getElementById('exportOptions').classList.toggle('hidden');};
document.getElementById('bShare').onclick = async () => { try { await navigator.clipboard.writeText(shareUrl(sessionId)); notify('Session URL copied to clipboard.'); } catch (error) { notify('Unable to copy the session URL.'); } };
document.getElementById('nameForm').onsubmit = async event => { event.preventDefault(); const form = event.currentTarget; const name = document.getElementById('userName').value.trim(); const errorBox = document.getElementById('nameError'); if (!name) return; setDisplayName(name); userName = name; form.querySelector('button').disabled = true; try { await initMapping(); document.getElementById('nameGate').classList.add('hidden'); } catch (error) { form.querySelector('button').disabled = false; errorBox.textContent = error.message === 'This session is full.' ? error.message : 'Could not load this session. Check the link and your connection.'; console.error(error); } };
(async () => {
  const params = new URLSearchParams(window.location.search); const hasTarget = params.has('session') || params.has('code');
  const result = await supabaseClient.auth.getSession(); currentAuthSession = result.data.session;
  if (!currentAuthSession && hasTarget) { const anonymous = await supabaseClient.auth.signInAnonymously(); if (anonymous.error) { window.location.replace('index.html'); return; } currentAuthSession = anonymous.data.session; }
  if (!currentAuthSession) { window.location.replace('index.html'); return; }
  if (!hasTarget) { window.location.replace(isAdminSession(currentAuthSession) ? 'dashboard.html' : 'index.html'); return; }
  userName = getDisplayName(); document.getElementById('userName').value = userName; document.getElementById('nameGate').classList.remove('hidden');
  supabaseClient.auth.onAuthStateChange((event, session) => { if (!session) window.location.replace('index.html'); else currentAuthSession = session; });
})();
