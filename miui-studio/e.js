/* 共享引擎与工具 —— 迷你版，给新建专区用 */
window.QA = (function(){
  const ENGINES={
    pollinations:{name:'Pollinations（免密·免注册）',free:true,url:'https://text.pollinations.ai/openai',models:['openai','mistral','llama'],hdr:()=>({}),fix:b=>({model:b.model,messages:b.messages,stream:false}),apply:''},
    keylessai:{name:'keylessai（免密）',free:true,url:'https://keylessai.thryx.workers.dev/v1/chat/completions',models:['openai','gpt-4o-mini'],hdr:()=>({'Authorization':'Bearer not-needed'}),fix:b=>b,apply:''},
    devsdocode:{name:'DevsDoCode（免密）',free:true,url:'https://devsdocode-openai.hf.space/v1/chat/completions',models:['gpt-4-turbo-2024-04-09'],hdr:()=>({'Authorization':'Bearer not-needed'}),fix:b=>b,apply:''},
    blockrun:{name:'BlockRun（免密）',free:true,url:'https://blockrun.ai/api/v1/chat/completions',models:['nvidia/gpt-oss-120b'],hdr:()=>({'Authorization':'Bearer not-needed'}),fix:b=>b,apply:''},
    cups:{name:'cups.moe（GitHub登录）',free:false,url:'https://free-llm.cups.moe/v1/chat/completions',models:['gpt-4.1-mini','gemini-2.5-flash'],hdr:k=>({'Authorization':'Bearer '+k}),fix:b=>b,apply:'https://free-llm.cups.moe'},
    chatanywhere:{name:'ChatAnywhere（绑GitHub）',free:false,url:'https://api.chatanywhere.tech/v1/chat/completions',models:['gpt-4o','deepseek-chat'],hdr:k=>({'Authorization':'Bearer '+k}),fix:b=>b,apply:'https://github.com/chatanywhere/GPT_API_free'},
    zhipu:{name:'智谱 GLM（手机号注册）',free:false,url:'https://open.bigmodel.cn/api/paas/v4/chat/completions',models:['glm-4-flash','glm-4-plus'],hdr:k=>({'Authorization':'Bearer '+k}),fix:b=>b,apply:'https://open.bigmodel.cn/'},
    deepseek:{name:'DeepSeek（免费key）',free:false,url:'https://api.deepseek.com/chat/completions',models:['deepseek-chat'],hdr:k=>({'Authorization':'Bearer '+k}),fix:b=>b,apply:'https://platform.deepseek.com/'},
    siliconflow:{name:'硅基流动（免费key）',free:false,url:'https://api.siliconflow.cn/v1/chat/completions',models:['Qwen/Qwen2.5-72B-Instruct','deepseek-ai/DeepSeek-V3'],hdr:k=>({'Authorization':'Bearer '+k}),fix:b=>b,apply:'https://cloud.siliconflow.cn/'},
    qwen:{name:'通义千问（免费key）',free:false,url:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',models:['qwen-max','qwen-plus'],hdr:k=>({'Authorization':'Bearer '+k}),fix:b=>b,apply:'https://dashscope.aliyun.com/'},
    moonshot:{name:'Kimi（免费key）',free:false,url:'https://api.moonshot.cn/v1/chat/completions',models:['moonshot-v1-128k'],hdr:k=>({'Authorization':'Bearer '+k}),fix:b=>b,apply:'https://platform.moonshot.cn/'}
  };
  function fetchTO(url,opts,t){const c=new AbortController();const id=setTimeout(()=>c.abort(),t||9000);return fetch(url,Object.assign({signal:c.signal},opts)).finally(()=>clearTimeout(id));}
  function buildCandidates(){const free=['pollinations','keylessai','devsdocode','blockrun'];const paid=['zhipu','deepseek','siliconflow','qwen','moonshot','cups','chatanywhere'];const out=free.slice();paid.forEach(k=>{if((localStorage['key_'+k]||'').trim())out.push(k);});return out;}
  async function callOne(ek,sys,text){
    const e=ENGINES[ek],key=localStorage['key_'+ek]||'';
    if(!e.free&&!key)return{ok:false,text:''};
    const body=e.fix({model:e.models[0],messages:[{role:'system',content:sys},{role:'user',content:text}],temperature:0.8,max_tokens:1200,stream:false});
    try{
      const r=await fetchTO(e.url,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},e.hdr(key)),body:JSON.stringify(body)},9000);
      if(!r.ok)return{ok:false,text:''};
      const d=await r.json();let c=d.choices?.[0]?.message?.content;if(!c&&d.choices?.[0]?.message?.reasoning)c=d.choices[0].message.reasoning;if(!c&&typeof d==='string')c=d;if(!c)c=d.error?.message||'';
      return{ok:true,text:(c||'').replace(/<think>[\s\S]*?<\/think>/g,'')};
    }catch(e){return{ok:false,text:''};}
  }
  async function ask(sys,text){
    const chain=buildCandidates();
    for(const ek of chain){const r=await callOne(ek,sys,text);if(r.ok&&r.text)return{text:r.text,eng:ek};}
    return null;
  }
  // 极简 markdown：```代码块``` / **粗** / # 标题 / - 列表 / 行内`code`
  function md(src){
    src=String(src).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // 代码块
    src=src.replace(/```(\w*)\n([\s\S]*?)```/g,(m,lang,code)=>`<pre class="cb" data-lang="${lang}"><button class="cpy" onclick="QA.copy(this)">复制</button><code>${code.replace(/\n$/,'').replace(/</g,'&lt;')}</code></pre>`);
    // 行内 code
    src=src.replace(/`([^`]+)`/g,'<code class="ic">$1</code>');
    // 标题
    src=src.replace(/^### (.*)$/gm,'<h4>$1</h4>').replace(/^## (.*)$/gm,'<h3>$1</h3>').replace(/^# (.*)$/gm,'<h2>$1</h2>');
    // 列表
    src=src.replace(/^\s*[-*] (.*)$/gm,'<li>$1</li>');
    src=src.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g,'<ul>$1</ul>');
    // 粗体
    src=src.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
    // 换行
    src=src.replace(/\n{2,}/g,'<br><br>').replace(/\n/g,'<br>');
    return src;
  }
  function copy(btn){const pre=btn.parentElement;const code=pre.querySelector('code').innerText;navigator.clipboard.writeText(code);btn.textContent='已复制✓';setTimeout(()=>btn.textContent='复制',1500);}
  return {ENGINES,fetchTO,buildCandidates,callOne,ask,md,copy};
})();
