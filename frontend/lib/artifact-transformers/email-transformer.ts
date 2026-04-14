export async function transformToEmail(data: any): Promise<string> {
  const template = data?.refined_email_template || data?.email_template || data;
  let text = '';
  
  if (template?.subject) {
    text += `Subject: ${template.subject}\n\n`;
  } else if (template?.Subject) {
    text += `Subject: ${template.Subject}\n\n`;
  }

  if (template?.body) {
    text += `${template.body}`;
  } else if (template?.Body) {
    text += `${template.Body}`;
  } else if (template?.content) {
    text += `${template.content}`;
  } else if (typeof template === 'string') {
    text += template;
  } else {
    // Fallback if structure is unexpected
    text = JSON.stringify(template, null, 2);
  }

  return text;
}
