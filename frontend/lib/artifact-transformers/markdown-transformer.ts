export async function transformToMarkdownPlan(data: any): Promise<string> {
  let plan = data?.coordinated_outreach_plan || data?.project_plan || data?.plan || data;
  let md = '# Coordinated Plan\n\n';

  if (typeof plan === 'object' && plan !== null && !Array.isArray(plan)) {
    for (const [dept, tasks] of Object.entries(plan)) {
      md += `## ${dept.charAt(0).toUpperCase() + dept.slice(1)}\n\n`;
      if (Array.isArray(tasks)) {
        tasks.forEach(task => {
          md += `- **${task.label || task.title || task.name || 'Task'}**: ${task.status || 'Pending'} (ID: ${task.task_id || 'N/A'})\n`;
          if (task.description) {
            md += `  - ${task.description}\n`;
          }
        });
      } else if (typeof tasks === 'object' && tasks !== null) {
        // Single task or object dict
        const task = tasks as any;
        md += `- **${task.label || task.title || task.name || 'Task'}**: ${task.status || 'Pending'} (ID: ${task.task_id || 'N/A'})\n`;
        if (task.description) {
          md += `  - ${task.description}\n`;
        }
      }
      md += '\n';
    }
  } else {
    md += "```json\n" + JSON.stringify(plan, null, 2) + "\n```";
  }

  return md;
}

export async function transformToMarkdownResearch(data: any): Promise<string> {
  let doc = data?.research_findings || data?.research || data;
  let md = '# Research Findings\n\n';

  if (doc?.findings) {
    md += `${doc.findings}\n\n`;
  }
  
  if (doc?.key_insights && Array.isArray(doc.key_insights)) {
    md += '## Key Insights\n\n';
    doc.key_insights.forEach((insight: string) => {
      md += `- ${insight}\n`;
    });
    md += '\n';
  }

  if (typeof doc === 'string') {
    return doc;
  }

  if (Array.isArray(doc)) {
    md += '## Data\n\n';
    doc.forEach((item: any, i) => {
      md += `### Item ${i+1}\n`;
      for (const [k, v] of Object.entries(item)) {
        md += `- **${k}**: ${v}\n`;
      }
      md += '\n';
    });
  }

  if (!doc?.findings && !doc?.key_insights && !Array.isArray(doc) && typeof doc === 'object' && doc !== null) {
     md += "```json\n" + JSON.stringify(doc, null, 2) + "\n```";
  }

  return md;
}
