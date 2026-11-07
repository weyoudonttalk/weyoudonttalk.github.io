// MIUI STUDIO 技术聊天站 —— 纯前端版（公共 MQTT 实时中转，无需后端）
// 账号本地存储；机器人本地智能回复；@某人触发提醒

const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_CHAT = 'miui/chat/v1';
const TOPIC_DM = 'miui/dm/';          // + 用户名
const BOTS = [
  { name: '小Q', color: '#5ef0ff', id: 'q' },
  { name: '蓝色大肥鱼', color: '#7b5cff', id: 'fish' },
  { name: '克劳德', color: '#ff8c42', id: 'claude' },
];
const NAME_RE = /^[一-龥A-Za-z0-9_]{2,20}$/;

const $ = s => document.querySelector(s);
const authEl = $('#auth'), appEl = $('#app');
const msgsEl = $('#msgs'), inputEl = $('#input'), sendBtn = $('#send');
const onlineEl = $('#online'), meEl = $('#me'), typingEl = $('#typing');
let me = '', client = null, connected = false;
let knownNames = [];   // 从聊天积累的名字，用于 @ 建议

// ---------- 账号（localStorage）----------
let mode = 'login';
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  t.classList.add('on'); mode = t.dataset.tab;
  $('#go').textContent = mode === 'login' ? '进入聊天室' : '注册并进入';
  $('#aerr').textContent = '';
});
function sh(pw) { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('') + ':' + btoa(unescape(encodeURIComponent(pw))); }
function check(pw, stored) { const [salt, h] = stored.split(':'); return sh(pw) === stored; }
function loadUser(n) { try { return JSON.parse(localStorage.getItem('chat_user_' + n) || 'null'); } catch { return null; } }

$('#go').onclick = () => {
  const u = $('#au').value.trim(), p = $('#ap').value;
  $('#aerr').textContent = '';
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
  me = u;
  localStorage.setItem('chat_me', u);
  enter();
};
if (localStorage.getItem('chat_me')) { me = localStorage.getItem('chat_me'); $('#au').value = me; }

function enter() {
  authEl.style.display = 'none'; appEl.style.display = 'flex';
  meEl.textContent = '🙋 ' + me;
  connect();
}
$('#logout').onclick = () => {
  if (client) try { client.end(true); } catch (e) {}
  localStorage.removeItem('chat_me'); location.reload();
};

// ---------- MQTT ----------
function connect() {
  onlineEl.textContent = '🟡 连接中…';
  client = mqtt.connect(BROKER, { clientId: 'miui_' + Math.random().toString(16).slice(2), clean: true, reconnectPeriod: 3000 });
  client.on('connect', () => {
    connected = true;
    onlineEl.textContent = '🟢 已连接';
    client.subscribe(TOPIC_CHAT);
    client.subscribe(TOPIC_DM + me);
    sysMsg('🎉 已连接聊天室 · 输入 @ 可召唤机器人');
  });
  client.on('reconnect', () => { onlineEl.textContent = '🟡 重连中…'; });
  client.on('offline', () => { onlineEl.textContent = '🔴 已断开'; });
  client.on('message', (topic, payload) => {
    let m; try { m = JSON.parse(payload.toString()); } catch { return; }
    if (topic === TOPIC_CHAT) addMsg(m);
    else if (topic === TOPIC_DM + me) showToast(`💬 ${m.from} 在聊天里 @ 了你`);
  });
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function renderText(text, mentions) {
  let html = escapeHtml(text);
  const names = Array.from(new Set([...mentions, ...knownNames]));
  for (const n of names.sort((a, b) => b.length - a.length)) html = html.split('@' + n).join(`<span class="mention">@${n}</span>`);
  return html;
}

function addMsg(m) {
  knownNames.push(m.user); if (knownNames.length > 60) knownNames = knownNames.slice(-60);
  const el = document.createElement('div');
  el.className = 'msg' + (m.user === me ? ' mine' : '') + ((m.mentions || []).includes(me) ? ' mentioned' : '');
  const who = document.createElement('div'); who.className = 'who' + (m.bot ? ' bot' : '');
  who.textContent = m.user;
  const bot = BOTS.find(b => b.name === m.user); if (bot) who.style.color = bot.color;
  const txt = document.createElement('div'); txt.className = 'txt'; txt.innerHTML = renderText(m.text, m.mentions);
  el.appendChild(who); el.appendChild(txt);
  if (m.ts) { const t = document.createElement('div'); t.className = 'me'; t.textContent = new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); el.appendChild(t); }
  msgsEl.appendChild(el);
  if ((m.mentions || []).includes(me) && m.user !== me) beep();
  msgsEl.scrollTop = msgsEl.scrollHeight;
}
function sysMsg(t) { const d = document.createElement('div'); d.className = 'sysmsg'; d.textContent = t; msgsEl.appendChild(d); msgsEl.scrollTop = msgsEl.scrollHeight; }

// ---------- 发送 + 机器人 ----------
function extractMentions(text) {
  const out = [];
  for (const b of BOTS) if (text.includes('@' + b.name)) out.push(b.name);
  return out;
}
function send() {
  const text = inputEl.value.trim();
  if (!text || !connected) return;
  const mentions = extractMentions(text);
  const msg = { type: 'chat', user: me, text, ts: Date.now(), mentions, bot: false };
  client.publish(TOPIC_CHAT, JSON.stringify(msg));
  // 给被@的真人发 DM 提醒
  for (const n of mentions) if (n !== me && !BOTS.some(b => b.name === n)) client.publish(TOPIC_DM + n, JSON.stringify({ from: me, text, ts: Date.now() }));
  // 触发机器人回复
  for (const b of BOTS) if (mentions.includes(b.name)) botReply(b, text);
  inputEl.value = ''; hideSuggest();
}
sendBtn.onclick = send;
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

function botReply(bot, prompt) {
  setTimeout(() => {
    typingEl.innerHTML = `<b>${bot.name}</b> 正在输入…`;
    setTimeout(() => {
      typingEl.innerHTML = '';
      const reply = genBotReply(bot, prompt);
      const msg = { type: 'chat', user: bot.name, text: reply, ts: Date.now(), mentions: [], bot: true };
      client.publish(TOPIC_CHAT, JSON.stringify(msg));
    }, 600 + Math.random() * 700);
  }, 200);
}
// 本地智能兜底（人格化）
function genBotReply(bot, prompt) {
  const q = prompt.replace(/@\S+/g, '').trim() || '这个话题';
  const short = q.slice(0, 40);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  if (bot.id === 'q') return pick([
    `收到~ 你说的「${short}」我get到了😄 先想清楚要干嘛，再动手，别一上来就猛写。`,
    `嘿，「${short}」我觉得可以这样——拆成小块一步步来，比一次性梭哈稳多了。`,
    `「${short}」先查官方文档，很多坑文档都写了，别急着问人。`,
    `懂你～「${short}」我之前也踩过，能跑起来比完美重要，先出原型再优化。`,
  ]);
  if (bot.id === 'fish') return pick([
    `【技术向】「${short}」核心思路：先确定边界条件，再写最小实现。\n\`\`\`js\nfunction solve(input){ /* 边界 + 主逻辑 */ return null; }\n\`\`\`\n骨架先搭起来，细节后填。`,
    `「${short}」我一般分三步：1) 复现 2) 定位瓶颈 3) 小步验证。别上来改全局。`,
    `聊「${short}」：性能问题先看火焰图，别靠猜；架构先画边界再谈选型。`,
    `「${short}」——过早优化是万恶之源，先把功能跑通再谈优雅。`,
  ]);
  return pick([
    `关于「${short}」，我的理解是这样：拆成几个层面看——先明确目标，再评估约束，最后给可执行建议。需要我展开哪点？`,
    `这是个好问题。「${short}」值得认真分析，我会从原理出发理清思路再给方案。`,
    `针对「${short}」，建议结构化推进：目标→约束→路径→小步验证，这样风险最低。`,
  ]);
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

// ---------- toast + 提示音 ----------
let toastTimer = null;
function showToast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); beep(); }
let audioCtx = null;
function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.06; o.start(); setTimeout(() => o.stop(), 140); } catch (e) {} }

if (me) enter();
