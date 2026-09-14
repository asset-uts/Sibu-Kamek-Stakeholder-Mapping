/* Shared Supabase client and session helpers. */
const SUPABASE_URL = 'https://gktlzckvzpbpteviftwo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JY2jvHg7shdpD4Jtt0cNfw_RF5hL-C-';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TEMPLATE_SESSION_ID = '11111111-1111-1111-1111-111111111111';
const DISPLAY_NAME_KEY = 'sibu_kamek_display_name';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATS = [
  ['Government & agencies', '#4A7C9B'],
  ['Digital, innovation & AI', '#6B4E8A'],
  ['Business & industry', '#C4573C'],
  ['Community & clan associations', '#D9A441'],
  ['Knowledge & civil society', '#3E7C6A'],
  ['Residents, youth & generations', '#B5622F'],
  ['More-than-human co-inhabitants', '#5F7A4A']
];

function getDisplayName() { return sessionStorage.getItem(DISPLAY_NAME_KEY) || ''; }
function setDisplayName(name) { sessionStorage.setItem(DISPLAY_NAME_KEY, name.trim()); }
function clearDisplayName() { sessionStorage.removeItem(DISPLAY_NAME_KEY); }
function isAnonymousSession(session) {
  return !!session?.user && (session.user.is_anonymous === true || session.user.user_metadata?.is_anonymous === true || session.user.app_metadata?.provider === 'anonymous');
}
function isAdminSession(session) { return !!session && !isAnonymousSession(session); }
function uuid() { return crypto.randomUUID(); }
function randomJoinCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}
function notify(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 3000);
}
function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}
async function withTimeout(promise, milliseconds) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), milliseconds))]);
}
async function insertSessionWithJoinCode({ id = uuid(), name, is_ephemeral = false, creator_type = is_ephemeral ? 'guest' : 'admin', expires_at = null } = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const row = { id, name, is_ephemeral, creator_type, expires_at, join_code: randomJoinCode(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { data, error } = await supabaseClient.from('sessions').insert(row).select().single();
    if (!error) return data || row;
    if (!String(error.code || '').includes('23505') && !/duplicate|unique/i.test(error.message || '')) throw error;
  }
  throw new Error('Could not allocate a unique session code. Please try again.');
}
async function touchSession(sessionId) {
  if (!sessionId) return;
  const { error } = await supabaseClient.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
  if (error) console.error('Could not update session timestamp:', error);
}
async function ensureParticipantName(sessionId, name) {
  const trimmed = String(name || '').trim();
  if (!sessionId || !trimmed) return null;
  const { data, error } = await supabaseClient.from('sessions').select('participant_names').eq('id', sessionId).maybeSingle();
  if (error) throw error;
  const current = Array.isArray(data?.participant_names) ? data.participant_names : [];
  if (current.includes(trimmed)) return current;
  const next = [...current, trimmed];
  const { error: updateError } = await supabaseClient.from('sessions').update({ participant_names: next }).eq('id', sessionId);
  if (updateError) throw updateError;
  return next;
}
async function cloneSession(sourceId, name, options = {}) {
  const isEphemeral = options.is_ephemeral === true;
  const created = await insertSessionWithJoinCode({
    name,
    is_ephemeral: isEphemeral,
    creator_type: options.creator_type || (isEphemeral ? 'guest' : 'admin'),
    expires_at: options.expires_at || (isEphemeral ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null)
  });
  const { data: sourceItems, error: itemError } = await supabaseClient.from('stakeholders').select('*').eq('session_id', sourceId);
  if (itemError) throw itemError;
  const { data: sourceLinks, error: linkError } = await supabaseClient.from('influence_links').select('*').eq('session_id', sourceId);
  if (linkError) throw linkError;
  const idMap = new Map();
  const items = (sourceItems || []).map(item => {
    const id = uuid();
    idMap.set(item.id, id);
    return { id, session_id: created.id, name: item.name, category: item.category, x: item.x, y: item.y, note: item.note || '' };
  });
  if (items.length) {
    const { error } = await supabaseClient.from('stakeholders').insert(items);
    if (error) throw error;
  }
  const links = (sourceLinks || []).filter(link => idMap.has(link.source_id) && idMap.has(link.target_id)).map(link => ({
    id: uuid(), session_id: created.id, source_id: idMap.get(link.source_id), target_id: idMap.get(link.target_id)
  }));
  if (links.length) {
    const { error } = await supabaseClient.from('influence_links').insert(links);
    if (error) throw error;
  }
  return created;
}
async function resolveSessionInput(value) {
  const input = value.trim();
  if (UUID_RE.test(input)) return input;
  const { data, error } = await supabaseClient.from('sessions').select('id').eq('join_code', input.toUpperCase()).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No session was found for that code.');
  return data.id;
}
function shareUrl(sessionId) {
  const url = new URL('mapping.html', window.location.href);
  url.searchParams.set('session', sessionId);
  return url.href;
}
async function importMapFile(file, name) {
  const value = JSON.parse(await file.text());
  if (!value || !Array.isArray(value.items) || !Array.isArray(value.links)) throw new Error('The JSON must contain items and links arrays.');
  const ids = new Set();
  for (const item of value.items) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string' || !Number.isInteger(item.cat) || item.cat < 0 || item.cat >= CATS.length || (item.x !== null && typeof item.x !== 'number') || (item.y !== null && typeof item.y !== 'number')) throw new Error('The JSON contains an invalid stakeholder item.');
    ids.add(item.id);
  }
  for (const link of value.links) if (!link || !ids.has(link.a) || !ids.has(link.b)) throw new Error('The JSON contains an invalid influence link.');
  const created = await insertSessionWithJoinCode({ name: name || 'Imported session' });
  const idMap = new Map();
  const items = value.items.map(item => { const id = uuid(); idMap.set(item.id, id); return { id, session_id: created.id, name: item.name, category: item.cat, x: item.x, y: item.y, note: item.note || '' }; });
  if (items.length) { const { error } = await supabaseClient.from('stakeholders').insert(items); if (error) throw error; }
  const links = value.links.map(link => ({ id: uuid(), session_id: created.id, source_id: idMap.get(link.a), target_id: idMap.get(link.b) }));
  if (links.length) { const { error } = await supabaseClient.from('influence_links').insert(links); if (error) throw error; }
  return created;
}
