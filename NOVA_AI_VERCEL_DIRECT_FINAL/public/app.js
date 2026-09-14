const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  mode: "chat",
  messages: [],
  attachments: [],
  webSearch: false,
  agent: false,
  busy: false
};

const modeTitles = {
  chat:"What can I help you create?",
  agent:"Your AI agent is ready.",
  writer:"Write something remarkable.",
  translate:"Break language barriers.",
  summarize:"Find the signal in the noise.",
  code:"Build the future with code.",
  brainstorm:"Generate the next big idea.",
  analyst:"Think deeper. Decide smarter."
};

function key(){ return `nova-history-${state.mode}`; }

function saveHistory(){
  localStorage.setItem(key(), JSON.stringify({
    title: state.messages.find(m=>m.role==="user")?.content?.slice(0,80) || "New conversation",
    messages: state.messages,
    updated: Date.now()
  }));
  renderHistory();
}

function allHistory(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k?.startsWith("nova-history-")){
      try{ out.push(JSON.parse(localStorage.getItem(k))); }catch{}
    }
  }
  return out.sort((a,b)=>b.updated-a.updated);
}

function renderHistory(){
  const box=$("#historyList");
  const items=allHistory();
  box.innerHTML = items.length ? items.map((h,i)=>`
    <button class="history-item" data-history="${i}">
      <b>${escapeHtml(h.title || "Conversation")}</b>
      <small>${new Date(h.updated).toLocaleString()}</small>
    </button>`).join("") : '<div style="padding:14px;color:#6e6a79;font-size:9px">No saved conversations yet.</div>';
  box.querySelectorAll(".history-item").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const h=items[Number(btn.dataset.history)];
      state.messages=h.messages||[];
      renderConversation();
      $("#historyPanel").classList.add("hidden");
    });
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function setMode(mode){
  state.mode=mode;
  state.agent=mode==="agent";
  $("#agentToggle").classList.toggle("on",state.agent);
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("#pageTitle").textContent=modeTitles[mode]||modeTitles.chat;
}

function renderMarkdown(text){
  const renderer = new marked.Renderer();
  renderer.code = ({text, lang}) => {
    const language = lang || "plaintext";
    let highlighted = escapeHtml(text);
    if(window.hljs && lang && hljs.getLanguage(lang)){
      highlighted = hljs.highlight(text,{language:lang}).value;
    }
    return `<div class="code-wrap"><div class="code-head"><span>${escapeHtml(language)}</span><button class="copy-code">Copy</button></div><pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre></div>`;
  };
  marked.setOptions({breaks:true,gfm:true,renderer});
  return DOMPurify.sanitize(marked.parse(text),{ADD_ATTR:["target"]});
}

function addMessage(role, content, streaming=false){
  const row=document.createElement("div");
  row.className=`msg ${role==="assistant"?"ai":"user"}`;
  row.innerHTML=`
    ${role==="assistant"?'<div class="msg-avatar">N</div>':""}
    <div class="bubble">${role==="assistant"?renderMarkdown(content):escapeHtml(content)}</div>
    ${role==="user"?'<div class="msg-avatar">U</div>':""}`;
  $("#messages").appendChild(row);
  if(streaming) row.dataset.streaming="true";
  bindCopy(row);
  scrollBottom();
  return row;
}

function bindCopy(scope=document){
  scope.querySelectorAll?.(".copy-code").forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound="1";
    btn.addEventListener("click",async()=>{
      const code=btn.closest(".code-wrap").querySelector("code").innerText;
      await navigator.clipboard.writeText(code);
      btn.textContent="Copied";
      setTimeout(()=>btn.textContent="Copy",1200);
    });
  });
}

function scrollBottom(){ $("#messages").scrollTop=$("#messages").scrollHeight; }

function renderConversation(){
  $("#messages").innerHTML="";
  if(!state.messages.length){
    $("#messages").innerHTML=`<div class="welcome glass-card"><div class="nova-orb-small">N</div><div><div class="welcome-title">Hello, I'm <span>NOVA</span>.</div><p>A next-generation AI workspace for thinking, creating, researching and building.</p></div></div>`;
  }else{
    state.messages.forEach(m=>addMessage(m.role,m.content));
  }
  scrollBottom();
}

function newChat(){
  state.messages=[]; state.attachments=[]; renderAttachments(); renderConversation(); saveHistory();
}

function renderAttachments(){
  const tray=$("#attachmentTray");
  tray.innerHTML=state.attachments.map((a,i)=>`
    <div class="attachment">
      ${a.kind==="image"?`<img src="${a.preview}" alt="">`:"<span>▣</span>"}
      <span>${escapeHtml(a.name)}${a.uploading?" · uploading…":""}</span><button data-remove="${i}">×</button>
    </div>`).join("");
  tray.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{
    state.attachments.splice(Number(b.dataset.remove),1); renderAttachments();
  });
}

async function readFile(file){
  const base = await new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file);
  });
  const kind=file.type.startsWith("image/")?"image":"file";
  const item={name:file.name,type:file.type,size:file.size,kind,preview:kind==="image"?base:null,data:base,uploading:false};
  state.attachments.push(item);
  renderAttachments();

  if(kind === "file") {
    item.uploading=true; renderAttachments();
    const form=new FormData(); form.append("file",file);
    const r=await fetch("/api/upload",{method:"POST",body:form});
    const data=await r.json().catch(()=>({error:"Upload failed"}));
    if(!r.ok) throw new Error(data.error||"Upload failed");
    item.fileId=data.id; item.uploading=false; renderAttachments();
  }
}

async function sendMessage(prefill){
  if(state.busy) return;
  const input=$("#input");
  const text=(prefill ?? input.value).trim();
  if(!text && !state.attachments.length) return;
  if(state.attachments.some(a=>a.uploading)) return;

  input.value=""; input.style.height="auto";
  state.busy=true; $("#send").disabled=true;

  // User-facing attachment labels.
  const attachmentNames=state.attachments.map(a=>a.name);
  const displayText=text || "Please analyze the attached file(s).";
  addMessage("user", attachmentNames.length ? `${displayText}\n\n📎 ${attachmentNames.join(", ")}` : displayText);

  // Build multimodal user content for the Responses API. Images can be sent as data URLs;
  // other files are uploaded to the OpenAI Files API and referenced by file ID.
  const content=[{type:"input_text",text:displayText}];
  for(const a of state.attachments){
    if(a.kind==="image") {
      content.push({type:"input_image",image_url:a.data,detail:"auto"});
    } else if(a.fileId) {
      content.push({type:"input_file",file_id:a.fileId,filename:a.name});
    }
  }

  state.messages.push({role:"user",content});
  state.attachments=[]; renderAttachments();
  saveHistory();

  const row=addMessage("assistant",'<div class="typing"><i></i><i></i><i></i></div>',true);
  const bubble=row.querySelector(".bubble");
  let answer="";

  try{
    const response=await fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        messages:state.messages,
        mode:state.mode,
        model:$("#model").value,
        webSearch:state.webSearch || state.agent
      })
    });

    if(!response.ok){
      const e=await response.json().catch(()=>({error:"Request failed"}));
      throw new Error(e.error||"Request failed");
    }

    const reader=response.body.getReader();
    const decoder=new TextDecoder();
    let buffer="";

    while(true){
      const {value,done}=await reader.read();
      if(done) break;
      buffer += decoder.decode(value,{stream:true});
      const chunks=buffer.split("\n\n");
      buffer=chunks.pop()||"";
      for(const chunk of chunks){
        const line=chunk.split("\n").find(x=>x.startsWith("data: "));
        if(!line) continue;
        let evt; try{evt=JSON.parse(line.slice(6));}catch{continue}
        if(evt.type==="delta"){
          answer += evt.text;
          bubble.innerHTML=renderMarkdown(answer);
          bindCopy(row);
          scrollBottom();
        }else if(evt.type==="status"){
          bubble.innerHTML=`<div style="color:#cbbdff;font-size:9px">${escapeHtml(evt.text)}</div>`;
          scrollBottom();
        }else if(evt.type==="error"){
          throw new Error(evt.error);
        }
      }
    }

    if(!answer) answer="NOVA completed the request without returning text.";
    bubble.innerHTML=renderMarkdown(answer);
    bindCopy(row);
    state.messages.push({role:"assistant",content:answer});
    saveHistory();
  }catch(err){
    bubble.textContent="NOVA error: "+err.message;
  }finally{
    row.removeAttribute("data-streaming");
    state.busy=false; $("#send").disabled=false; input.focus();
  }
}

$("#send").onclick=()=>sendMessage();
$("#newChat").onclick=newChat;
$("#clearBtn").onclick=newChat;
$("#attachBtn").onclick=()=>$("#fileInput").click();
$("#uploadBtn").onclick=()=>$("#fileInput").click();
$("#fileInput").onchange=async e=>{
  for(const file of e.target.files){
    try{ await readFile(file); } catch(err){ alert("NOVA upload error: "+err.message); state.attachments=state.attachments.filter(a=>!a.uploading); renderAttachments(); }
  }
  e.target.value="";
};

$("#searchToggle").onclick=()=>{
  state.webSearch=!state.webSearch;
  $("#searchToggle").classList.toggle("on",state.webSearch);
};
$("#agentToggle").onclick=()=>{
  state.agent=!state.agent;
  if(state.agent) setMode("agent");
  $("#agentToggle").classList.toggle("on",state.agent);
};
$("#historyBtn").onclick=()=>{renderHistory();$("#historyPanel").classList.remove("hidden")};
$("#closeHistory").onclick=()=>$("#historyPanel").classList.add("hidden");

$$(".nav-item").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$$(".quick").forEach(b=>b.onclick=()=>sendMessage(b.dataset.prompt));

$("#input").addEventListener("input",e=>{
  e.target.style.height="auto";
  e.target.style.height=Math.min(e.target.scrollHeight,140)+"px";
});
$("#input").addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}
});

setMode("chat");
renderHistory();

const mobileMenu = $("#mobileMenu");
const drawer = $(".left");
const drawerBackdrop = $("#drawerBackdrop");
function closeDrawer(){ drawer?.classList.remove("open"); drawerBackdrop?.classList.remove("open"); }
mobileMenu?.addEventListener("click",()=>{ drawer?.classList.add("open"); drawerBackdrop?.classList.add("open"); });
drawerBackdrop?.addEventListener("click",closeDrawer);
$$('.nav-item').forEach(b=>b.addEventListener('click',closeDrawer));


const imagePanel=$("#imagePanel");
$("#imageBtn")?.addEventListener("click",()=>{ imagePanel.classList.toggle("hidden"); $("#imagePrompt").focus(); });
$("#closeImage")?.addEventListener("click",()=>imagePanel.classList.add("hidden"));
$("#generateImage")?.addEventListener("click", async ()=>{
  const prompt=$("#imagePrompt").value.trim();
  const result=$("#imageResult");
  if(!prompt) return;
  const btn=$("#generateImage"); btn.disabled=true; btn.textContent="Generating…";
  result.innerHTML='<div class="image-loading"><i></i><span>NOVA is creating your image…</span></div>';
  try{
    const r=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,aspectRatio:$("#imageRatio").value,imageSize:$("#imageSize").value})});
    const data=await r.json().catch(()=>({error:"Image request failed"}));
    if(!r.ok) throw new Error(data.error||"Image request failed");
    const src=`data:${data.mimeType};base64,${data.data}`;
    result.innerHTML=`<div class="image-result"><img src="${src}" alt="NOVA generated image"><div class="image-actions"><a href="${src}" download="nova-image.png">Download</a><button id="useImage">Add to chat</button></div></div>`;
    $("#useImage").onclick=()=>{ state.attachments.push({name:"NOVA-generated.png",type:data.mimeType,size:0,kind:"image",preview:src,data:src,uploading:false}); renderAttachments(); imagePanel.classList.add("hidden"); };
  }catch(err){ result.innerHTML=`<div class="image-error">NOVA Image: ${escapeHtml(err.message)}</div>`; }
  finally{ btn.disabled=false; btn.textContent="Generate"; }
});
