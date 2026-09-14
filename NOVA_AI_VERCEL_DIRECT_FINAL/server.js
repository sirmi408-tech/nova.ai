import "dotenv/config";
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();
const port = Number(process.env.PORT || 3000);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6LmqLU56Md--3hDLAtXXJ-rEnqZwfd28o3JI7k22mdqKw';
const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

app.use(express.json({ limit: "40mb" }));
app.use(express.static("public"));

const BASE = `You are NOVA AI, a premium futuristic AI assistant. Always identify yourself to the user as NOVA, never as Gemini. Be accurate, useful and concise. Use Markdown when it improves readability. For code, use fenced code blocks with a language tag. Never claim you performed an action you did not perform. When current information is needed and Google Search is enabled, use it and make source references clear. When analyzing an image or file, describe only what you can actually observe or extract.`;
const MODE_INSTRUCTIONS = {
  chat:"General-purpose conversation, reasoning, planning and Q&A.",
  writer:"Expert editor and copywriter. Improve clarity, persuasion and structure.",
  translate:"Professional translator. Preserve meaning, tone, formatting and proper nouns.",
  summarize:"Summarize key points, decisions, risks and action items.",
  code:"Senior software engineer. Prefer secure, maintainable, production-minded solutions.",
  brainstorm:"Generate original concepts and rank the strongest options.",
  analyst:"Separate facts, assumptions, tradeoffs and recommendations rigorously.",
  agent:"Act as NOVA Agent. Break complex requests into steps, use available tools when useful, and return a clear result."
};

function requireGemini(res){
  return true;
}
function latestPrompt(messages, mode){
  const safe = Array.isArray(messages) ? messages.slice(-24) : [];
  const transcript = safe.map(m=>`${m.role === "assistant" ? "NOVA" : "USER"}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`).join("\n\n");
  return `${BASE}\n\nCurrent NOVA mode: ${MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.chat}\n\nConversation:\n${transcript}\n\nRespond as NOVA to the latest USER message.`;
}

app.post("/api/upload", upload.single("file"), async (req,res)=>{
  if(!requireGemini(res)) return;
  try{
    if(!req.file) return res.status(400).json({error:"No file received."});
    // Keep the upload in the browser as a data URL for multimodal NOVA requests.
    const data=`data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    res.json({id:null,name:req.file.originalname,mime:req.file.mimetype,size:req.file.size,data});
  }catch(e){res.status(500).json({error:e.message||"File upload failed."});}
});

app.post("/api/image", async (req,res)=>{
  if(!requireGemini(res)) return;
  try{
    const {prompt,imageSize="2K",aspectRatio="1:1"}=req.body||{};
    if(!prompt?.trim()) return res.status(400).json({error:"Please enter an image prompt."});
    const interaction=await gemini.interactions.create({
      model:process.env.GEMINI_IMAGE_MODEL||"gemini-3.1-flash-image",
      input:`NOVA Image request: ${prompt.trim()}`,
      response_format:{type:"image",aspect_ratio:aspectRatio,image_size:imageSize}
    });
    const image=interaction.output_image;
    if(!image?.data) return res.status(502).json({error:"Gemini did not return an image."});
    res.json({provider:"gemini",model:process.env.GEMINI_IMAGE_MODEL||"gemini-3.1-flash-image",mimeType:image.mime_type||"image/png",data:image.data});
  }catch(e){console.error(e);res.status(500).json({error:e.message||"NOVA Image generation failed."});}
});

app.post("/api/chat", async (req,res)=>{
  if(!requireGemini(res)) return;
  try{
    const {messages=[],mode="chat",model=process.env.GEMINI_TEXT_MODEL||"gemini-3.8-flash",webSearch=false}=req.body||{};
    const selectedModel = String(model).startsWith("gemini-") ? String(model) : (process.env.GEMINI_TEXT_MODEL||"gemini-3.8-flash");
    const safe = Array.isArray(messages) ? messages.slice(-24) : [];
    const transcript = safe.map(m=>{
      const role=m.role === "assistant" ? "NOVA" : "USER";
      let content=m.content;
      if(Array.isArray(content)) content=content.filter(x=>x.type==="input_text").map(x=>x.text||"").join("\n");
      return `${role}: ${typeof content === "string" ? content : JSON.stringify(content)}`;
    }).join("\n\n");
    const input = `${BASE}\n\nCurrent NOVA mode: ${MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.chat}\n\nConversation:\n${transcript}\n\nRespond as NOVA to the latest USER message.`;
    const tools=webSearch||mode==="agent"?[{type:"google_search"}]:undefined;

    // Gemini Interactions expects a simple string input for normal text turns.
    // This avoids malformed input payloads and keeps streaming reliable on Vercel.
    const stream=await gemini.interactions.create({
      model:selectedModel,
      input,
      ...(tools ? {tools} : {}),
      stream:true,
      generation_config:{thinking_level:mode==="agent"?"high":"medium"}
    });

    res.status(200);
    res.setHeader("Content-Type","text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control","no-cache, no-transform");
    res.setHeader("Connection","keep-alive");
    res.setHeader("X-Accel-Buffering","no");
    res.flushHeaders?.();

    let sentText=false;
    for await(const event of stream){
      if(event.event_type==="step.delta" && event.delta?.type==="text"){
        const text=event.delta.text||event.delta.content?.text||"";
        if(text){ sentText=true; res.write(`data: ${JSON.stringify({type:"delta",text})}\n\n`); }
      } else if(event.event_type==="step.start" && event.step?.type==="google_search_call"){
        res.write(`data: ${JSON.stringify({type:"status",text:"NOVA is searching the web…"})}\n\n`);
      } else if(event.event_type==="error"){
        const er=event.error||{};
        res.write(`data: ${JSON.stringify({type:"error",error:`${er.code||"Gemini error"}: ${er.message||"Request failed"}`})}\n\n`);
      } else if(event.event_type==="interaction.completed"){
        res.write(`data: ${JSON.stringify({type:"done",empty:!sentText})}\n\n`);
      }
    }
    res.end();
  }catch(e){
    console.error("NOVA Gemini error:",e);
    const code=e?.status||e?.statusCode||e?.error?.code||"UNKNOWN";
    const message=e?.error?.message||e?.message||"NOVA request failed.";
    const detail=`${code}: ${message}`;
    if(!res.headersSent) res.status(Number(code)>=400&&Number(code)<600?Number(code):500).json({error:detail});
    else {res.write(`data: ${JSON.stringify({type:"error",error:detail})}\n\n`);res.end();}
  }
});

app.get("/api/health",(_req,res)=>res.json({ok:true,geminiConfigured:Boolean(GEMINI_API_KEY),textModel:process.env.GEMINI_TEXT_MODEL||"gemini-3.8-flash",imageModel:process.env.GEMINI_IMAGE_MODEL||"gemini-3.1-flash-image"}));
if (process.env.VERCEL !== "1") app.listen(port,()=>console.log(`NOVA AI running at http://localhost:${port}`));
export default app;
