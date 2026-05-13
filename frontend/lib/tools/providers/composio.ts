import { Composio } from "@composio/core";

// Define normalized ToolResult
export type ToolResult = {
  success: boolean;
  service: string;
  action: string;
  data: any;
  summary: string;
  rawResponse?: any;
};

// Canonical slug overrides: Composio's actual action names sometimes differ
// from the intuitive <SERVICE>_<ACTION> pattern. Exported so the approval
// execution route can apply the same normalization without going through runComposioTool.
export const COMPOSIO_SLUG_OVERRIDE_MAP: Record<string, string> = {
  GMAIL_CREATE_DRAFT: 'GMAIL_CREATE_EMAIL_DRAFT',
  GMAIL_SEND: 'GMAIL_SEND_EMAIL',
  GMAIL_REPLY: 'GMAIL_REPLY_TO_EMAIL',
  GMAIL_GET: 'GMAIL_GET_MESSAGE',
  GITHUB_CREATE_PR: 'GITHUB_CREATE_A_PULL_REQUEST',
  GITHUB_MERGE_PR: 'GITHUB_MERGE_A_PULL_REQUEST',
  NOTION_CREATE_PAGE: 'NOTION_CREATE_A_PAGE_IN_DATABASE',
}

/**
 * Standardized Composio execution wrapper with enhanced defensive logging for audit.
 * Handles entity routing and catches authentication token errors gracefully.
 */
export async function runComposioTool({
  userId,
  service,
  action,
  params
}: {
  userId: string;
  service: string;
  action: string;
  params: Record<string, any>;
}): Promise<ToolResult> {
  console.log(`[COMPOSIO-AUDIT] Starting tool call: ${service}.${action} for user ${userId}`, { params: Object.keys(params) });

  if (!process.env.COMPOSIO_API_KEY) {
    console.error('[COMPOSIO-AUDIT] CRITICAL: COMPOSIO_API_KEY missing');
    throw new Error("COMPOSIO_API_KEY is not defined in the environment.");
  }

  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  const rawToolName = `${service}_${action}`.toUpperCase();
  const toolName = COMPOSIO_SLUG_OVERRIDE_MAP[rawToolName] ?? rawToolName;

  console.log(`[COMPOSIO-AUDIT] Normalized tool: ${toolName}`);

  try {
    const execution: any = await composio.tools.execute(toolName, {
      userId,  // entityId for multi-tenant
      arguments: params,
      dangerouslySkipVersionCheck: true,
    });

    console.log(`[COMPOSIO-AUDIT] Execution response for ${toolName}:`, { success: execution?.successful || execution?.is_success, hasData: !!execution?.data });

    if (execution && (execution.successful === false || execution.is_success === false)) {
      console.warn(`[COMPOSIO-AUDIT] Tool reported failure:`, execution.error);
      throw new Error(execution.error || `Execution failed: ${JSON.stringify(execution.data || execution)}`);
    }

    return {
      success: true,
      service,
      action,
      data: execution,
      summary: `Successfully executed ${toolName}`,
      rawResponse: execution,
    };
  } catch (err: any) {
    console.error(`[COMPOSIO-AUDIT] Tool execution error for ${service}.${action}:`, {
      message: err.message,
      status: err.status,
      stack: err.stack?.substring(0, 500)
    });

    // Attempt auto-retry on 401s (token expiry boundary)
    if (err.message?.includes('401') || err.status === 401) {
      console.warn(`[COMPOSIO-AUDIT] Token potentially expired (401) for ${service}. Retrying...`);
      try {
        const retryExecution: any = await composio.tools.execute(toolName, {
          userId,
          arguments: params,
          dangerouslySkipVersionCheck: true,
        });

        if (retryExecution && (retryExecution.successful === false || retryExecution.is_success === false)) {
          throw new Error(retryExecution.error || `Execution failed on retry: ${JSON.stringify(retryExecution.data || retryExecution)}`);
        }

        console.log(`[COMPOSIO-AUDIT] Retry succeeded for ${toolName}`);
        return {
          success: true,
          service,
          action,
          data: retryExecution,
          summary: `Successfully executed ${toolName} on retry`,
          rawResponse: retryExecution,
        };
      } catch (retryErr: any) {
        console.error(`[COMPOSIO-AUDIT] Retry also failed:`, retryErr.message);
        return {
          success: false,
          service,
          action,
          data: null,
          summary: `Failed to execute ${toolName}. Authentication error.`,
          rawResponse: retryErr,
        };
      }
    }

    return {
      success: false,
      service,
      action,
      data: null,
      summary: `Failed to execute ${toolName}.`,
      rawResponse: err,
    };
  }
}
