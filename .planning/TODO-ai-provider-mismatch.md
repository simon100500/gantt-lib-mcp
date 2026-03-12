# AI provider mismatch and quota backlog

- Investigate and unify model/provider resolution between local `.env`, Docker `env_file`, and CapRover runtime env so dev and prod use the same `OPENAI_BASE_URL` and `OPENAI_MODEL`.
- Force explicit SDK provider selection in agent runs (`authType: 'openai'` or documented alternative) and add startup logging of effective provider, model, and base URL to diagnose why prod can route to Gemini while dev hits Qwen.
- Add quota-aware fallback and operator diagnostics for AI requests: detect Qwen quota exhaustion, surface the real upstream provider in logs/UI, and optionally fail over to a configured Gemini model when Qwen credits are exhausted.
