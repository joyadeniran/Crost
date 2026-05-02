
import { callLLM } from '../llm-client';

const PARAM_RESOLVER_SYSTEM_NOTE = `You are a specialized JSON parameter extractor.
Your job is to take a natural language command and a target tool (service.action), and extract the required parameters into a valid JSON object.

RULES:
1. ONLY output valid JSON. No prose, no markdown fences, no explanation.
2. If a parameter is missing but required, try to infer it from context or use a sensible default (e.g. for email subject, use a summary of the intent).
3. Map natural language to these common parameter names:
   - Gmail send_email: to, subject, body
   - Slack post_message: channel, text
   - GitHub create_pull_request: owner, repo, title, head, base, body
   - Notion create_page: database_id, properties
4. If you cannot extract any parameters, return an empty object {}.
5. Use the specific service and action provided to guide your mapping.`;

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
    } catch (parseErr) {
      console.error('[resolveToolParameters] JSON parse failed:', jsonStr);
      return {};
    }
  } catch (err) {
    console.error('[resolveToolParameters] LLM call failed:', err);
    return {};
  }
}
