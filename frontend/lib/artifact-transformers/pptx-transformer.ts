import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { healSkillPayload } from './heal-payload';

/**
 * PPTX Transformer Fallback.
 * Since a native PPTX library is not yet available in the environment,
 * this transformer converts the PPTX JSON slide manifest into a 
 * professionally formatted "Slide Deck Document" (.docx).
 * 
 * Each slide becomes a new page or a clearly separated section with 
 * a "SLIDE X" header, keeping the structure intended by the LLM.
 */
export async function transformToPresentation(data: any): Promise<Buffer> {
  const children: Paragraph[] = [];

  // 1. Repair and validate payload
  data = healSkillPayload(data);

  if (data?.skill !== 'pptx' || !Array.isArray(data?.slides)) {
    // If it's not valid PPTX JSON, just treat as generic document
    const { transformToDocument } = await import('./document-transformer');
    return transformToDocument(data);
  }

  // 2. Title Page
  if (data.title) {
    children.push(new Paragraph({
      text: String(data.title).toUpperCase(),
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    }));
  }
  
  children.push(new Paragraph({
    children: [new TextRun({ text: "PROPOSED PRESENTATION DECK", bold: true, size: 28 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
  }));

  // Metadata / Theme info (internal note)
  if (data.theme) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: "Theme Suggestion: ", bold: true }),
        new TextRun(`Primary: ${data.theme.primary_color || 'Default'}, Secondary: ${data.theme.secondary_color || 'Default'}`),
      ],
      spacing: { after: 400 },
    }));
  }

  // 3. Render Slides
  for (const slide of data.slides) {
    const num = slide.slide_number || '';
    
    // Slide Header
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `─────────────────────────────────────────────────`, color: "888888" }),
      ],
      spacing: { before: 400 },
    }));

    children.push(new Paragraph({
      children: [
        new TextRun({ text: `SLIDE ${num}: ${String(slide.title || 'Untitled').toUpperCase()}`, bold: true, size: 32 }),
      ],
      spacing: { before: 200, after: 200 },
    }));

    // Subtitle (if title layout)
    if (slide.layout === 'title' && slide.subtitle) {
      children.push(new Paragraph({
        children: [new TextRun({ text: String(slide.subtitle), italics: true, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }));
    }

    // Bullets (Standard content)
    if (Array.isArray(slide.bullets)) {
      for (const bullet of slide.bullets) {
        children.push(new Paragraph({
          text: String(bullet),
          bullet: { level: 0 },
          spacing: { after: 100 },
        }));
      }
    }

    // Two Column Support
    if (slide.layout === 'two_column') {
      if (Array.isArray(slide.left)) {
        children.push(new Paragraph({ children: [new TextRun({ text: "Left Column:", bold: true, italics: true })], spacing: { before: 100 } }));
        for (const b of slide.left) {
          children.push(new Paragraph({ text: String(b), bullet: { level: 0 } }));
        }
      }
      if (Array.isArray(slide.right)) {
        children.push(new Paragraph({ children: [new TextRun({ text: "Right Column:", bold: true, italics: true })], spacing: { before: 100 } }));
        for (const b of slide.right) {
          children.push(new Paragraph({ text: String(b), bullet: { level: 0 } }));
        }
      }
    }

    // Quote layout
    if (slide.layout === 'quote' && slide.quote) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `"${slide.quote}"`, italics: true, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
      }));
      if (slide.attribution) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `— ${slide.attribution}`, bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }));
      }
    }

    // Speaker Notes
    if (slide.notes) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: "SPEAKER NOTES: ", bold: true, color: "CC6600", size: 20 }),
          new TextRun({ text: String(slide.notes), size: 20 }),
        ],
        spacing: { before: 200, after: 200 },
      }));
    }
  }

  // 4. Sources section (Spec §9.5 requirement)
  if (data.sources) {
    children.push(new Paragraph({
      text: "SOURCES & CITATIONS",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 600, after: 200 },
    }));

    const { memo_ids = [], kb_file_ids = [], tool_calls = [] } = data.sources;

    if (memo_ids.length > 0) {
      children.push(new Paragraph({ text: "Company Memos:", bold: true }));
      for (const m of memo_ids) children.push(new Paragraph({ text: String(m), bullet: { level: 0 } }));
    }
    if (kb_file_ids.length > 0) {
      children.push(new Paragraph({ text: "Knowledge Base:", bold: true }));
      for (const k of kb_file_ids) children.push(new Paragraph({ text: String(k), bullet: { level: 0 } }));
    }
    if (tool_calls.length > 0) {
      children.push(new Paragraph({ text: "Tools Used:", bold: true }));
      for (const t of tool_calls) {
        const desc = typeof t === 'string' ? t : `${t.service}.${t.action}`;
        children.push(new Paragraph({ text: desc, bullet: { level: 0 } }));
      }
    }
  }

  // 5. Finalize as DOCX buffer
  const doc = new Document({
    sections: [{
      properties: {},
      children: children,
    }],
  });

  return Packer.toBuffer(doc);
}
