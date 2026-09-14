# NOVA AI PRO

A futuristic ChatGPT/Claude-style AI workspace with a purple-blue NOVA identity.

## Included
- Streaming Responses API output
- Markdown rendering
- Syntax-highlighted code blocks + Copy button
- Image understanding
- File upload through Gemini Files API
- Web search toggle
- Agent mode with web search and multi-step reasoning instructions
- Conversation history in localStorage
- Model switching: GPT-5.6 Luna / Terra / Sol
- Mobile-responsive layout
- Composer stays below the conversation/output area
- UI can start even before an API key is configured

Gemini's current model catalog documents GPT-5.6 Luna, Terra and Sol as Responses API models with text/image input and web search support. See the official docs for current availability and pricing.

## Run
1. Install Node.js.
2. Open this folder in CMD/PowerShell.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Put your API key in `.env`.
6. Run `npm start`.
7. Open `http://localhost:3000`.

If the API key is missing, the NOVA UI still opens and shows a clear configuration message when you try to send a request.


This version routes NOVA text and NOVA Image through the Gemini API. Gemini Interactions API supports streaming text and tools such as Google Search.
