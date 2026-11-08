// Cloudflare Worker：AI 视频理解代理（Gemini 视频分析）
// 部署：Cloudflare 后台 → Workers → 新建 → 粘贴本文件 → 绑定环境变量 GEMINI_KEY
// 免费额度足够个人使用。视频通过 Gemini File API 上传，不落盘。
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // CORS
    const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST,OPTIONS'};
    if (req.method === 'OPTIONS') return new Response(null, {headers:cors});
    if (url.pathname !== '/analyze') return new Response('POST /analyze with video file', {status:404, headers:cors});
    if (req.method !== 'POST') return new Response('use POST', {status:405, headers:cors});

    const KEY = env.GEMINI_KEY;
    if (!KEY) return new Response(JSON.stringify({error:'Worker 未配置 GEMINI_KEY'}), {status:500, headers:cors});

    try {
      const buf = await req.arrayBuffer();
      const mime = req.headers.get('content-type') || 'video/mp4';

      // 1) 上传到 Gemini File API
      const up = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files?key=' + KEY, {
        method:'POST',
        headers:{'X-Goog-Upload-Protocol':'raw','X-Goog-Upload-File-Name':'clip.mp4','Content-Type':mime},
        body: buf
      });
      const upj = await up.json();
      if (!upj.file || !upj.file.uri) throw new Error('上传失败: ' + JSON.stringify(upj));
      const fileUri = upj.file.uri;

      // 2) 等文件 active
      let state = '';
      for (let i=0;i<30;i++){
        const r = await fetch(fileUri + '?key=' + KEY);
        const j = await r.json();
        state = j.state;
        if (state === 'ACTIVE') break;
        await new Promise(r=>setTimeout(r, 2000));
      }
      if (state !== 'ACTIVE') throw new Error('视频处理超时，请换更短的视频');

      // 3) 让 Gemini 当混剪导演，分析高燃点
      const prompt = `你是一名顶级影视混剪导演。请观看这段视频，找出最"高燃/最炸/最精彩"的 3~6 个片段。
对每个片段给出：开始秒数(start)、结束秒数(end)、燃点类型(type，从[战斗,反转,高潮,视觉奇观,情绪爆发,名场面]选)、一句话理由(reason)、该段建议配乐BPM(bpm)。
再给出整体建议：overallBpm(全片建议BPM)、title(8字内混剪标题)、mood(风格关键词)。
只返回如下严格 JSON，不要任何额外文字：
{"segments":[{"start":0,"end":5,"type":"战斗","reason":" explosion","bpm":140}],"overallBpm":132,"title":"燃爆全场","mood":"史诗热血"}`;

      const gen = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + KEY, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          contents:[{parts:[{file_data:{file_uri:fileUri, mime_type:mime}}, {text:prompt}]}],
          generationConfig:{responseMimeType:'application/json', temperature:0.3}
        })
      });
      const gj = await gen.json();
      let txt = gj?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // 容错：去掉可能的 ```json 包裹
      txt = txt.replace(/```json/g,'').replace(/```/g,'').trim();
      const parsed = JSON.parse(txt);
      return new Response(JSON.stringify(parsed), {headers:{'Content-Type':'application/json', ...cors}});
    } catch(e) {
      return new Response(JSON.stringify({error: e.message}), {status:500, headers:cors});
    }
  }
}
