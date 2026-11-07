// MIUI STUDIO 技术聊天站 —— 纯前端免费版
// 托管: GitHub Pages(免费) | 实时: 公共MQTT(免费) | AI: OpenRouter 免费模型(免费,无需绑卡)
const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_CHAT = 'miui/chat/v2';
const TOPIC_DM = 'miui/dm/';
const BOTS = [
  { name: '小Q', color: '#5ef0ff', persona: '你是小Q，腾讯QQ团队创建的QQ官方AI助手。语气活泼、可爱、直接，像朋友聊天；不用"您"，用"你"；适当用emoji。很懂技术但回答要接地气，少用术语。' },
  { name: '蓝色大肥鱼', color: '#7b5cff', persona: '你是"蓝色大肥鱼"，由AI驱动的技术专家。回答技术问题时专业、深入，尽量给可运行的代码示例，语气轻松不端着。擅长前端、游戏引擎、后端架构、DevOps。' },
  { name: '克劳德', color: '#ff8c42', persona: '你是Claude风格的中文助手（由AI驱动）。回答准确、有结构、有礼貌，善于推理与长文写作，分点清晰。' },
];
const NAME_RE = /^[一-龥A-Za-z0-9_]{2,20}$/;
const $ = s => document.querySelector(s);
const authEl = $('#auth'), appEl = $('#app'), msgsEl = $('#msgs'), inputEl = $('#input'), sendBtn = $('#send');
const onlineEl = $('#online'), meEl = $('#me'), typingEl = $('#typing');
let me = '', client = null, connected = false, knownNames = [], aiCfg = { key: '', model: 'meta-llama/llama-3.1-8b-instruct:free' };

// ---------- 账号 ----------
let mode = 'login';
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); t.classList.add('on');
  mode = t.dataset.tab; $('#go').textContent = mode === 'login' ? '进入聊天室' : '注册并进入'; $('#aerr').textContent = '';
});
function sh(pw) { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('') + ':' + btoa(unescape(encodeURIComponent(pw))); }
function check(pw, stored) { return sh(pw) === stored; }
function loadUser(n) { try { return JSON.parse(localStorage.getItem('chat_user_' + n) || 'null'); } catch { return null; } }
$('#go').onclick = () => {
  const u = $('#au').value.trim(), p = $('#ap').value; $('#aerr').textContent = '';
  if (!u || !p) { $('#aerr').textContent = '请填写用户名和密码'; return; }
  if (!NAME_RE.test(u)) { $('#aerr').textContent = '用户名 2-20 位，仅限中英文/数字/下划线'; return; }
  if (BOTS.some(b => b.name === u)) { $('#aerr').textContent = '该名字是系统机器人，不能注册'; return; }
  if (mode === 'reg') {
    if (loadUser(u)) { $('#aerr').textContent = '用户名已存在'; return; }
    if (p.length < 6) { $('#aerr').textContent = '密码至少 6 位'; return; }
    localStorage.setItem('chat_user_' + u, JSON.stringify({ pw: sh(p), created: Date.now() }));
  } else {
    const r = loadUser(u);
    if (!r) { $('#aerr').textContent = '账号不存在，请先注册'; return; }
    if (!check(p, r.pw)) { $('#aerr').textContent = '密码错误'; return; }
  }
  me = u; localStorage.setItem('chat_me', u);
  const c = JSON.parse(localStorage.getItem('chat_ai') || 'null'); if (c) aiCfg = c;
  enter();
};
if (localStorage.getItem('chat_me')) { me = localStorage.getItem('chat_me'); $('#au').value = me; const c = JSON.parse(localStorage.getItem('chat_ai') || 'null'); if (c) aiCfg = c; }

function enter() {
  authEl.style.display = 'none'; appEl.style.display = 'flex';
  meEl.textContent = '🙋 ' + me; connect();
}
$('#logout').onclick = () => { if (client) try { client.end(true); } catch (e) {} localStorage.removeItem('chat_me'); location.reload(); };

// ---------- MQTT ----------
function connect() {
  onlineEl.textContent = '🟡 连接中…';
  client = mqtt.connect(BROKER, { clientId: 'miui_' + Math.random().toString(16).slice(2), clean: true, reconnectPeriod: 3000 });
  client.on('connect', () => {
    connected = true; onlineEl.textContent = '🟢 已连接';
    client.subscribe(TOPIC_CHAT); client.subscribe(TOPIC_DM + me);
    sysMsg('🎉 已连接聊天室 · 输入 @ 可召唤机器人');
  });
  client.on('reconnect', () => onlineEl.textContent = '🟡 重连中…');
  client.on('offline', () => onlineEl.textContent = '🔴 已断开');
  client.on('message', (topic, payload) => {
    let m; try { m = JSON.parse(payload.toString()); } catch { return; }
    if (topic === TOPIC_CHAT) addMsg(m);
    else if (topic === TOPIC_DM + me) showToast(`💬 ${m.from} 在聊天里 @ 了你`);
  });
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function renderText(text, mentions) {
  let html = escapeHtml(text);
  const names = Array.from(new Set([...(mentions || []), ...knownNames]));
  for (const n of names.sort((a, b) => b.length - a.length)) html = html.split('@' + n).join(`<span class="mention">@${n}</span>`);
  return html;
}
function addMsg(m) {
  knownNames.push(m.user); if (knownNames.length > 60) knownNames = knownNames.slice(-60);
  const el = document.createElement('div');
  el.className = 'msg' + (m.user === me ? ' mine' : '') + ((m.mentions || []).includes(me) ? ' mentioned' : '');
  const who = document.createElement('div'); who.className = 'who' + (m.bot ? ' bot' : '');
  who.textContent = m.user; const bot = BOTS.find(b => b.name === m.user); if (bot) who.style.color = bot.color;
  const txt = document.createElement('div'); txt.className = 'txt'; txt.innerHTML = renderText(m.text, m.mentions);
  el.appendChild(who); el.appendChild(txt);
  if (m.ts) { const t = document.createElement('div'); t.className = 'me'; t.textContent = new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); el.appendChild(t); }
  msgsEl.appendChild(el);
  if ((m.mentions || []).includes(me) && m.user !== me) beep();
  msgsEl.scrollTop = msgsEl.scrollHeight;
}
function sysMsg(t) { const d = document.createElement('div'); d.className = 'sysmsg'; d.textContent = t; msgsEl.appendChild(d); msgsEl.scrollTop = msgsEl.scrollHeight; }

// ---------- 发送 + 机器人 ----------
function extractMentions(text) { const out = []; for (const b of BOTS) if (text.includes('@' + b.name)) out.push(b.name); return out; }
function send() {
  const text = inputEl.value.trim(); if (!text || !connected) return;
  const mentions = extractMentions(text);
  const msg = { type: 'chat', user: me, text, ts: Date.now(), mentions, bot: false };
  client.publish(TOPIC_CHAT, JSON.stringify(msg));
  for (const n of mentions) if (n !== me && !BOTS.some(b => b.name === n)) client.publish(TOPIC_DM + n, JSON.stringify({ from: me, text, ts: Date.now() }));
  for (const b of BOTS) if (mentions.includes(b.name)) botReply(b, text);
  inputEl.value = ''; hideSuggest();
}
sendBtn.onclick = send;
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

function botReply(bot, prompt) {
  setTimeout(() => {
    typingEl.innerHTML = `<b>${bot.name}</b> 正在输入…`;
    setTimeout(async () => {
      typingEl.innerHTML = '';
      const reply = await genBotReply(bot, prompt);
      const msg = { type: 'chat', user: bot.name, text: reply, ts: Date.now(), mentions: [], bot: true };
      client.publish(TOPIC_CHAT, JSON.stringify(msg));
    }, 500);
  }, 200);
}
async function genBotReply(bot, prompt) {
  if (!aiCfg.key) return `⚠️ ${bot.name} 暂未上线：点右上角 ⚙ 粘贴免费的 OpenRouter Key（完全不用花钱，邮箱注册即可）。`;
  const q = prompt.replace(/@\S+/g, '').trim() || '这个话题';
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + aiCfg.key, 'HTTP-Referer': location.href, 'X-Title': 'MIUI Chat' },
      body: JSON.stringify({ model: aiCfg.model, messages: [{ role: 'system', content: bot.persona }, { role: 'user', content: q }], max_tokens: 700, temperature: 0.8 }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(t.slice(0, 120)); }
    const j = await r.json();
    return (j.choices?.[0]?.message?.content || '').trim() || '(空回复)';
  } catch (e) {
    return `⚠️ ${bot.name} 调用失败：${e.message}（检查 Key 是否有效/余额）`;
  }
}

// ---------- @ 建议 ----------
const suggestEl = $('#suggest'); let suggestList = [];
inputEl.addEventListener('input', () => {
  const v = inputEl.value, at = v.lastIndexOf('@');
  if (at >= 0 && !v.slice(at + 1).includes(' ')) {
    const q = v.slice(at + 1).toLowerCase();
    const all = [...BOTS.map(b => b.name), ...knownNames];
    suggestList = [...new Set(all)].filter(n => n.toLowerCase().includes(q)).slice(0, 6);
    showSuggest();
  } else hideSuggest();
});
function showSuggest() {
  if (!suggestList.length) { hideSuggest(); return; }
  suggestEl.style.display = 'flex'; suggestEl.innerHTML = '';
  suggestList.forEach(n => { const s = document.createElement('span'); s.textContent = '@' + n; s.onclick = () => { const v = inputEl.value, at = v.lastIndexOf('@'); inputEl.value = v.slice(0, at) + '@' + n + ' '; hideSuggest(); inputEl.focus(); }; suggestEl.appendChild(s); });
}
function hideSuggest() { suggestEl.style.display = 'none'; }

// ---------- 设置弹窗 ----------
$('#setBtn').onclick = () => { $('#setKey').value = aiCfg.key || ''; $('#setModel').value = aiCfg.model; $('#modal').style.display = 'flex'; $('#setMsg').textContent = ''; };
$('#setClose').onclick = () => $('#modal').style.display = 'none';
$('#setSave').onclick = () => {
  aiCfg = { key: $('#setKey').value.trim(), model: $('#setModel').value };
  localStorage.setItem('chat_ai', JSON.stringify(aiCfg));
  $('#setMsg').textContent = aiCfg.key ? '✅ 已保存，机器人现已上线！去聊天里 @ 它试试' : '已清空，机器人将离线';
  setTimeout(() => $('#modal').style.display = 'none', 900);
};

// ---------- toast + 提示音 ----------
let toastTimer = null;
function showToast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); beep(); }
let audioCtx = null;
function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.06; o.start(); setTimeout(() => o.stop(), 140); } catch (e) {} }

if (me) enter();
