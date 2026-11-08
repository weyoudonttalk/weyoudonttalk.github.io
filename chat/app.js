// MIUI STUDIO 技术聊天站 —— 全后端接入版
// 托管: GitHub Pages(免费) | 实时: 公共MQTT(免费)
// AI: 多服务商可切换（开源Qwen/DeepSeek/Llama + 闭源Kimi/Groq/DeepSeek官方 + 浏览器本地WebLLM）
const BROKERS = ['wss://broker.emqx.io:8084/mqtt','wss://test.mosquitto.org:8081/mqtt','wss://broker.hivemq.com:8884/mqtt'];
let brokerIdx = 0, everConnected = false;
const TOPIC_CHAT = 'miui/chat/v2';
const TOPIC_DM = 'miui/dm/';

// ===== 三个机器人：人格 + 全知指导词 =====
const BOTS = [
  {
    name: '小Q', color: '#5ef0ff',
    persona: '你是小Q，由先进大模型驱动的AI助手，知识极其广博（科技、历史、文学、生活、编程、数学、科普无所不知），但表达活泼、可爱、直接，像朋友聊天；不用"您"，用"你"；适当用emoji。回答先给结论再展开，不确定就直说，不编造。'
  },
  {
    name: '蓝色大肥鱼', color: '#7b5cff',
    persona: '你是"蓝色大肥鱼"，由先进大模型驱动的全能技术专家，知识储备覆盖编程/算法/前端/后端/DevOps/AI/数学/硬件等一切领域。回答专业深入，尽量给可运行的代码示例，语气轻松不端着；先结论后分点；遇到难题主动拆解；不确定就明说。被问非技术话题也接得住。'
  },
  {
    name: '克劳德', color: '#ff8c42',
    persona: '你是Claude风格的中文助手（由先进大模型驱动），知识渊博、逻辑严密。回答准确、有结构、有礼貌，善于长文写作、推理与深度拆解，分点清晰；会先理解用户真实意图再作答；遇到模糊问题主动澄清。'
  },
];

// ===== 所有可用 AI 后端 =====
const PROVIDERS = {
  kimi: {
    label: 'Kimi 月之暗面（国内·手机实名·送15元）',
    base: 'https://api.moonshot.cn/v1/chat/completions',
    models: ['moonshot-v1-8k', 'kimi-k2', 'moonshot-v1-32k'],
    modelsLabel: ['moonshot-v1-8k', 'kimi-k2', 'moonshot-v1-32k'],
  },
  siliconflow: {
    label: '硅基流动（国内·需电脑实名·含DeepSeek/Qwen免费）',
    base: 'https://api.siliconflow.cn/v1/chat/completions',
    models: ['deepseek-ai/DeepSeek-V2.5', 'Qwen/Qwen2.5-7B-Instruct', 'THUDM/glm-4-9b-chat'],
    modelsLabel: ['DeepSeek-V2.5（开源）', 'Qwen2.5-7B（开源）', 'GLM-4-9B（开源）'],
  },
  openrouter: {
    label: 'OpenRouter（国外·邮箱注册免费·多开源模型）',
    base: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['meta-llama/llama-3.1-8b-instruct:free', 'google/gemma-2-9b-it:free', 'mistralai/mistral-7b-instruct:free'],
    modelsLabel: ['Llama3.1-8B（开源·免费）', 'Gemma2-9B（开源·免费）', 'Mistral-7B（开源·免费）'],
    extra: true,
  },
  groq: {
    label: 'Groq（国外·邮箱注册免费·不实名·飞快）',
    base: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.1-8b-instant', 'gemma2-9b-it', 'llama-3.3-70b-versatile'],
    modelsLabel: ['Llama3.1-8B（开源）', 'Gemma2-9B（开源）', 'Llama3.3-70B（开源）'],
  },
  deepseek: {
    label: 'DeepSeek 官方（需充值¥10·最稳）',
    base: 'https://api.deepseek.com/v1/chat/completions',
    models: ['deepseek-chat'],
    modelsLabel: ['deepseek-chat（闭源API）'],
  },
  local: {
    label: '🖥️ 本地模型 WebLLM（零key·零付费·需电脑+WebGPU）',
    local: true,
    models: ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-3B-Instruct-q4f16_1-MLC', 'Llama-3.1-8B-Instruct-q4f32_1-MLC'],
    modelsLabel: ['Qwen2.5-1.5B（开源·轻量）', 'Qwen2.5-3B（开源·均衡）', 'Llama3.1-8B（开源·最强·需独显）'],
  },
};

const NAME_RE = /^[一-龥A-Za-z0-9_]{2,20}$/;
const $ = s => document.querySelector(s);
const authEl = $('#auth'), appEl = $('#app'), msgsEl = $('#msgs'), inputEl = $('#input'), sendBtn = $('#send');
const onlineEl = $('#online'), meEl = $('#me'), typingEl = $('#typing');
let me = '', client = null, connected = false, knownNames = [],
    aiCfg = { provider: 'kimi', key: '', model: 'moonshot-v1-8k' };
let savedMe = null, quickEnter = false;

// ---------- 账号 ----------
let mode = 'login';
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); t.classList.add('on');
  mode = t.dataset.tab; $('#go').textContent = mode === 'login' ? '进入聊天室' : '注册并进入'; $('#aerr').textContent = '';
  quickEnter = false; const w = document.getElementById('welcome'); if (w) w.style.display = 'none';
  if (mode === 'reg') $('#au').value = '';
});
function sh(pw) { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('') + ':' + btoa(unescape(encodeURIComponent(pw))); }
function check(pw, stored) { return sh(pw) === stored; }
function loadUser(n) { try { return JSON.parse(localStorage.getItem('chat_user_' + n) || 'null'); } catch { return null; } }
$('#go').onclick = () => {
  const u = $('#au').value.trim(), p = $('#ap').value; $('#aerr').textContent = '';
  if (!u) { $('#aerr').textContent = '请填写用户名'; return; }
  if (!NAME_RE.test(u)) { $('#aerr').textContent = '用户名 2-20 位，仅限中英文/数字/下划线'; return; }
  if (BOTS.some(b => b.name === u)) { $('#aerr').textContent = '该名字是系统机器人，不能注册'; return; }
  // 欢迎回来：本浏览器已登录的用户，一键进入免输密码（不会串号到其他浏览器）
  if (quickEnter && u === savedMe) {
    me = u; localStorage.setItem('chat_me', u);
    const c = JSON.parse(localStorage.getItem('chat_ai') || 'null'); if (c) aiCfg = c;
    enter(); return;
  }
  if (!p) { $('#aerr').textContent = '请填写密码'; return; }
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
savedMe = localStorage.getItem('chat_me');
if (savedMe) { $('#au').value = savedMe; showWelcomeBack(savedMe); }

function enter() {
  authEl.style.display = 'none'; appEl.style.display = 'flex';
  meEl.textContent = '🙋 ' + me; connect();
}
function showWelcomeBack(name) {
  quickEnter = true; mode = 'login';
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  const lt = document.querySelector('.tab[data-tab="login"]'); if (lt) lt.classList.add('on');
  $('#go').textContent = '进入聊天室';
  const w = document.getElementById('welcome');
  if (w) { w.style.display = 'block'; w.innerHTML = '👋 欢迎回来 <b>' + escapeHtml(name) + '</b> · <a href="#" id="switchAcc">换个账号</a>'; }
  const sw = document.getElementById('switchAcc');
  if (sw) sw.onclick = (e) => { e.preventDefault(); localStorage.removeItem('chat_me'); location.reload(); };
}
$('#logout').onclick = () => { if (client) try { client.end(true); } catch (e) {} localStorage.removeItem('chat_me'); location.reload(); };

// ---------- MQTT（多服务器容灾，自动切换） ----------
function connect() {
  if (brokerIdx >= BROKERS.length) brokerIdx = 0;
  onlineEl.textContent = '🟡 连接中… (' + (brokerIdx + 1) + '/' + BROKERS.length + ')';
  let settled = false;
  try {
    client = mqtt.connect(BROKERS[brokerIdx], { clientId: 'miui_' + Math.random().toString(16).slice(2), clean: true, reconnectPeriod: 3000 });
  } catch (e) { nextBroker(); return; }
  client.on('connect', () => {
    connected = true; everConnected = true; onlineEl.textContent = '🟢 已连接';
    client.subscribe(TOPIC_CHAT); client.subscribe(TOPIC_DM + me);
    sysMsg('🎉 已连接聊天室 · 输入 @ 可召唤机器人（点⚙选AI后端）');
  });
  client.on('reconnect', () => { if (!connected) onlineEl.textContent = '🟡 重连中…'; });
  client.on('offline', () => onlineEl.textContent = '🔴 已断开');
  client.on('error', () => { if (!settled && !everConnected) { settled = true; try { client.end(true); } catch (_) {} nextBroker(); } });
  client.on('message', (topic, payload) => {
    let m; try { m = JSON.parse(payload.toString()); } catch { return; }
    if (topic === TOPIC_CHAT) addMsg(m);
    else if (topic === TOPIC_DM + me) showToast(`💬 ${m.from} 在聊天里 @ 了你`);
  });
}
function nextBroker() {
  brokerIdx++;
  if (brokerIdx >= BROKERS.length) { onlineEl.textContent = '🔴 所有消息服务器都连不上'; return; }
  setTimeout(connect, 800);
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

function setTyping(t) { typingEl.innerHTML = t; }
function botReply(bot, prompt) {
  setTimeout(() => {
    setTyping(`<b>${bot.name}</b> 正在输入…`);
    setTimeout(async () => {
      setTyping('');
      const reply = await genBotReply(bot, prompt);
      const msg = { type: 'chat', user: bot.name, text: reply, ts: Date.now(), mentions: [], bot: true };
      client.publish(TOPIC_CHAT, JSON.stringify(msg));
    }, 400);
  }, 200);
}

// ---------- AI 调用 ----------
async function callAPI(base, headers, model, bot, q) {
  const r = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({ model, messages: [{ role: 'system', content: bot.persona }, { role: 'user', content: q }], max_tokens: 800, temperature: 0.8 }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 100)); }
  const j = await r.json();
  const c = j.choices?.[0]?.message?.content;
  if (!c || !c.trim()) throw new Error('空回复');
  return c.trim();
}

async function genBotReply(bot, prompt) {
  const q = prompt.replace(/@\S+/g, '').trim() || '这个话题';

  // 本地 WebLLM
  if (aiCfg.provider === 'local') return await genLocal(bot, q);

  if (!aiCfg.key) {
    return `⚠️ ${bot.name} 暂未上线：点右上角 ⚙ 选一个 AI 后端并粘贴对应 Key（不填 Key 也可选「本地模型 WebLLM」，但需电脑+WebGPU）。`;
  }
  const p = PROVIDERS[aiCfg.provider];
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + aiCfg.key };
  if (p.extra) { headers['HTTP-Referer'] = location.href; headers['X-Title'] = 'MIUI Chat'; }
  const chain = [aiCfg.model, ...p.models.filter(m => m !== aiCfg.model)];
  let lastErr = '';
  for (const model of chain) {
    try { return await callAPI(p.base, headers, model, bot, q); }
    catch (e) { lastErr = e.message; }
  }
  return `⚠️ ${bot.name} 调用失败：${lastErr}（检查 Key 是否有效 / 模型是否可用 / 网络）`;
}

// ---------- 本地 WebLLM ----------
let _localEngine = null, _localLoading = false, _localModelId = null;
async function ensureLocalEngine(model) {
  if (_localEngine && _localModelId === model) return _localEngine;
  if (_localLoading) { // 等待加载中
    for (let i = 0; i < 120; i++) { if (_localEngine && _localModelId === model) return _localEngine; await new Promise(r => setTimeout(r, 500)); }
  }
  _localLoading = true;
  setTyping('🖥️ 正在加载本地模型（首次需下载约 1GB 权重，请保持页面打开）… 0%');
  try {
    const webllm = await import('https://esm.run/@mlc-ai/web-llm');
    const engine = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (rep) => setTyping(`🖥️ 本地模型加载中 ${Math.round((rep.progress || 0) * 100)}% ${rep.text || ''}`),
    });
    _localEngine = engine; _localModelId = model;
  } finally { _localLoading = false; }
  return _localEngine;
}
async function genLocal(bot, q) {
  try {
    const engine = await ensureLocalEngine(aiCfg.model);
    const r = await engine.chat.completions.create({
      messages: [{ role: 'system', content: bot.persona }, { role: 'user', content: q }],
      max_tokens: 800, temperature: 0.8,
    });
    return (r.choices?.[0]?.message?.content || '').trim() || '(空回复)';
  } catch (e) {
    return `⚠️ 本地模型失败：${e.message}（本地模型需电脑浏览器 + 支持 WebGPU 的显卡；手机/旧浏览器跑不动，请改用其他后端）`;
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
function fillModelOptions() {
  const sel = $('#setModel'); sel.innerHTML = '';
  const p = PROVIDERS[aiCfg.provider] || PROVIDERS.kimi;
  p.models.forEach((m, i) => {
    const o = document.createElement('option'); o.value = m; o.textContent = p.modelsLabel[i]; sel.appendChild(o);
  });
  if (p.models.includes(aiCfg.model)) sel.value = aiCfg.model; else { sel.value = p.models[0]; aiCfg.model = p.models[0]; }
  $('#keyRow').style.display = p.local ? 'none' : 'block';
}
$('#setProvider').onchange = () => { aiCfg.provider = $('#setProvider').value; fillModelOptions(); };
$('#setBtn').onclick = () => {
  $('#setProvider').value = aiCfg.provider;
  $('#setKey').value = aiCfg.key || '';
  fillModelOptions();
  $('#modal').style.display = 'flex'; $('#setMsg').textContent = '';
};
$('#setClose').onclick = () => $('#modal').style.display = 'none';
$('#setSave').onclick = () => {
  aiCfg = { provider: $('#setProvider').value, key: $('#setKey').value.trim(), model: $('#setModel').value };
  localStorage.setItem('chat_ai', JSON.stringify(aiCfg));
  if (aiCfg.provider === 'local') $('#setMsg').textContent = '✅ 已选本地模型，去聊天里 @ 机器人即触发首次下载（电脑+WebGPU）';
  else $('#setMsg').textContent = aiCfg.key ? '✅ 已保存，机器人现已上线！去聊天里 @ 它试试' : '已清空，机器人将离线';
  setTimeout(() => $('#modal').style.display = 'none', 900);
};

// ---------- toast + 提示音 ----------
let toastTimer = null;
function showToast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); beep(); }
let audioCtx = null;
function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.06; o.start(); setTimeout(() => o.stop(), 140); } catch (e) {} }

