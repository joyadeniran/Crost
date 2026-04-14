import { transformToEmail } from './email-transformer';
import { transformToMarkdownPlan, transformToMarkdownResearch } from './markdown-transformer';

export interface OutputDetection {
  sourceFormat: 'json' | 'text' | 'array';
  contentType: 'email' | 'document' | 'plan' | 'research' | 'generic';
  targetFormat: 'txt' | 'docx' | 'md' | 'xlsx' | 'json' | 'csv';
  transformer?: (data: any) => Promise<string | Buffer>;
}

export function detectOutputType(content: string, isJson: boolean): OutputDetection {
  if (!isJson) {
    return {
      sourceFormat: 'text',
      contentType: 'generic',
      targetFormat: 'txt'
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { sourceFormat: 'text', contentType: 'generic', targetFormat: 'txt' };
  }

  if (Array.isArray(parsed) || (parsed && 'data' in parsed && Array.isArray(parsed.data))) {
    return {
      sourceFormat: 'array',
      contentType: 'research',
      targetFormat: 'json', // Fallback to json in MVP for array
    };
  }

  // Check object keys for specific types
  if (parsed && ('refined_email_template' in parsed || 'email_template' in parsed || ('subject' in parsed && 'body' in parsed))) {
    return {
      sourceFormat: 'json',
      contentType: 'email',
      targetFormat: 'txt',
      transformer: transformToEmail
    };
  }

  if (parsed && ('coordinated_outreach_plan' in parsed || 'project_plan' in parsed)) {
    return {
      sourceFormat: 'json',
      contentType: 'plan',
      targetFormat: 'md',
      transformer: transformToMarkdownPlan
    };
  }

  if (parsed && ('research_findings' in parsed || 'key_insights' in parsed)) {
    return {
      sourceFormat: 'json',
      contentType: 'research',
      targetFormat: 'md',
      transformer: transformToMarkdownResearch
    };
  }

  // Default JSON fallback
  return {
    sourceFormat: 'json',
    contentType: 'generic',
    targetFormat: 'json',
  };
}
