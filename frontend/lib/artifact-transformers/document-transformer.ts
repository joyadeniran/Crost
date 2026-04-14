import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

export async function transformToDocument(data: any): Promise<Buffer> {
  const template = data?.refined_email_template || data?.email_template || data;
  const subject = template?.subject || template?.Subject;
  const body = template?.body || template?.Body || template?.content || (typeof template === 'string' ? template : JSON.stringify(template, null, 2));

  const children: Paragraph[] = [];
  
  if (subject) {
    children.push(new Paragraph({
      text: `Subject: ${subject}`,
      heading: HeadingLevel.HEADING_2,
    }));
  }

  const lines = body.split('\n');
  for (const line of lines) {
    children.push(new Paragraph({
      children: [new TextRun(line)]
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  return Packer.toBuffer(doc);
}
