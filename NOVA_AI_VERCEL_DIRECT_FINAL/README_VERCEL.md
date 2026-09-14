# NOVA AI — Vercel + Gemini

This build uses Gemini for NOVA text chat, streaming, vision and NOVA Image.

## Vercel Environment Variables
- `GEMINI_API_KEY` = your Google AI Studio API key
- `GEMINI_TEXT_MODEL` = `gemini-3.8-flash`
- `GEMINI_IMAGE_MODEL` = `gemini-3.1-flash-image`

Do not paste the API key into browser JavaScript or commit `.env`. Add it under Vercel Project → Settings → Environment Variables.


## Direct Gemini key build
This build contains a server-side Gemini key fallback so the app can run without adding an environment variable. For production, rotate the key and use GEMINI_API_KEY in Vercel instead.
