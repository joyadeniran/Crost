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

/**
 * Standardized Composio execution wrapper.
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
  if (!process.env.COMPOSIO_API_KEY) {
    throw new Error("COMPOSIO_API_KEY is not defined in the environment.");
  }

  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  const toolName = `${service}_${action}`.toUpperCase();

  try {
    const execution = await composio.tools.execute(toolName, {
      userId,
      arguments: params,
      dangerouslySkipVersionCheck: true,
    });

    return {
      success: true,
      service,
      action,
      data: execution,
      summary: `Successfully executed ${toolName}`,
      rawResponse: execution,
    };
  } catch (err: any) {
    // Attempt auto-retry on 401s (token expiry boundary)
    if (err.message?.includes('401') || err.status === 401) {
      console.warn(`[Composio] Token potentially expired (401) for ${service}. Retrying...`);
      try {
        const retryExecution = await composio.tools.execute(toolName, {
          userId,
          arguments: params,
          dangerouslySkipVersionCheck: true,
        });
        
        return {
          success: true,
          service,
          action,
          data: retryExecution,
          summary: `Successfully executed ${toolName} on retry`,
          rawResponse: retryExecution,
        };
      } catch (retryErr: any) {
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
