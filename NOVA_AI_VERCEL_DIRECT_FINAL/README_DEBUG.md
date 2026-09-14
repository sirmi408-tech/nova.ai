# NOVA AI Gemini debugging

1. In Vercel add `GEMINI_API_KEY` as a Production environment variable.
2. Redeploy after changing the variable.
3. Open `/api/health` on the deployed URL. It should show `geminiConfigured: true`.
4. Chat uses `gemini-3.8-flash` and the Gemini Interactions API streaming format.
5. If chat still fails, NOVA now shows the actual HTTP/error code instead of only `Request failed`.

Important: never commit or paste the API key into frontend files. Google recommends environment variables and says leaked keys can be blocked.
