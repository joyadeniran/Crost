
import { callLLM } from '../llm-client';

const PARAM_RESOLVER_SYSTEM_NOTE = `You are a parameter resolver AND content drafter for business tools.
Take a natural language command and a target tool (service.action) and produce a valid JSON object of the tool's parameters.

RULES:
1. ONLY output valid JSON. No prose, no markdown fences, no explanation.
2. Map natural language to these parameter names:
   - Gmail send_email: to, subject, body
   - Slack post_message: channel, text
   - GitHub create_pull_request: owner, repo, title, head, base, body
   - Notion create_page: database_id, properties
3. DRAFT free-text content fields — never leave them empty. When the command gives
   an INTENT or TOPIC rather than literal copy (e.g. "welcome email", "follow up
   about the demo"), WRITE the full message yourself:
   - "body" (email) / "text" (Slack): compose a complete, professional, ready-to-send
     message in the first person as the founder/company. Use real paragraphs and a
     sign-off. Several sentences minimum — do NOT echo the intent as the body.
   - "subject": a concise, specific subject line (not just the raw intent).
4. Extract concrete values literally present (recipients, channels, dates, URLs).
5. If a required value is genuinely unknowable, omit it. If nothing is extractable, return {}.
6. Use the specific service and action provided to guide your mapping.

Example — Tool: gmail.send_email, Command: "to joy@supplya.shop welcome email"
{"to":"joy@supplya.shop","subject":"Welcome to Supplya!","body":"Hi there,\\n\\nWelcome aboard — we're thrilled to have you with us. Your account is all set up and ready to go...\\n\\nIf you have any questions, just reply to this email.\\n\\nBest,\\nThe Supplya Team"}`;

export async function resolveToolParameters(
  service: string,
  action: string,
  rawText: string,
  userId: string
): Promise<Record<string, any>> {
  const prompt = `Tool: ${service}.${action}\nUser Command: "${rawText}"\n\nExtract parameters in JSON:`;

  try {
    // Use a fast model for parameter extraction
    const { content } = await callLLM('groq/llama-3.1-8b-instant', prompt, PARAM_RESOLVER_SYSTEM_NOTE, userId);
    
    let jsonStr = content.trim();
    // Strip markdown if the LLM hallucinated it
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      // Small models (this runs on llama-3.1-8b) often add preamble despite
      // the ONLY-JSON rule. Salvage the outermost {...} before giving up —
      // an empty return here silently produces thin/empty emails downstream.
      const first = jsonStr.indexOf('{');
      const last = jsonStr.lastIndexOf('}');
      if (first !== -1 && last > first) {
        try {
          return JSON.parse(jsonStr.slice(first, last + 1));
        } catch { /* fall through */ }
      }
      console.error('[resolveToolParameters] JSON parse failed:', jsonStr);
      return {};
    }
  } catch (err) {
    console.error('[resolveToolParameters] LLM call failed:', err);
    return {};
  }
}
