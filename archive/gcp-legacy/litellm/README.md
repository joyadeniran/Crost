# LiteLLM Proxy Service

This is the LLM gateway for Crost. It provides a unified OpenAI-compatible API for all model providers.

## Setup

### Environment Variables

Set these in the Render dashboard for the `crost-litellm` service:

1. **LITELLM_MASTER_KEY** (Required)
   - Master API key to control access
   - Prevent unauthorized credit usage
   - Example: `sk-litellm-master-key-12345`

2. **LITELLM_PROXY_ADMIN_KEY** (Optional)
   - Admin key for configuration endpoints
   - If not set, admin endpoints are disabled

3. **LITELLM_LOG** (Optional)
   - Set to `DEBUG` for detailed logging
   - Set to `INFO` for standard logging

### Provider API Keys

LiteLLM supports multiple providers. Configure keys as environment variables:

**Groq:**
```
GROQ_API_KEY=gsk_...
```

**Google (Gemini):**
```
GOOGLE_API_KEY=AIza...
```

**Anthropic (Claude):**
```
ANTHROPIC_API_KEY=sk-ant-...
```

**OpenAI:**
```
OPENAI_API_KEY=sk-...
```

## Usage in Crost

The frontend and worker services use LiteLLM at:
```
https://crost-litellm.onrender.com
```

With master key in `LITELLM_MASTER_KEY` environment variable.

## API Endpoints

- **`GET /health`** - Health check endpoint
- **`POST /v1/chat/completions`** - Chat completion (OpenAI-compatible)
- **`GET /v1/models`** - List available models
- **`POST /proxy/logs`** - View request logs (admin only)

## Model Routes

LiteLLM automatically routes requests to the correct provider based on the `model` parameter:

```json
{
  "model": "groq/llama-3.3-70b-versatile",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

Supported model prefixes:
- `groq/` — Routes to Groq API
- `gemini/` — Routes to Google Gemini API
- `claude/` — Routes to Anthropic Claude API
- `gpt-` — Routes to OpenAI API

## Health Check

The frontend service checks `/api/health` which includes LiteLLM status at `/crost-litellm.onrender.com/health`.

If LiteLLM is down, the health check will report it, and the UI will show service status.

## Monitoring

- Check Render logs for the `crost-litellm` service
- Set `LITELLM_LOG=DEBUG` for detailed request/response logs
- Monitor token usage in each provider's dashboard
