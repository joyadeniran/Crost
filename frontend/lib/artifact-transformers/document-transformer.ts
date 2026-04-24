import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { healSkillPayload } from './heal-payload';

/**
 * Universal document transformer.
 * Handles all department JSON schemas:
 *   - SKILL.md:   { skill: "docx", sections: [...] } — canonical skill output
 *   - OPERATIONS: deliverable_content.summary + sections
 *   - SALES:      output.summary + objectives/strategies
 *   - MARKETING:  strategy.summary + target_audience/channels
 *   - FINANCE:    analysis.summary + financial_framework
 *   - Legacy:     refined_email_template, email_template, subject/body
 *   - Fallback:   Any JSON — recursively rendered as sections
 */
export async function transformToDocument(data: any): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Repair double-encoded JSON emitted by some LLM responses (e.g. `sections`
  // arriving as a stringified JSON array) before running skill-schema checks.
  data = healSkillPayload(data);

  // ─── SKILL.md schema: { skill: "docx", sections: [...] } ─────────────────
  // Highest priority — the LLM followed the docx SKILL.md contract.
  if (data?.skill === 'docx' && Array.isArray(data?.sections)) {
    // Title
    if (data.title) {
      children.push(new Paragraph({
        text: String(data.title),
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      }));
    }
    // Subtitle / author / date metadata line
    const meta = [data.subtitle, data.author, data.date].filter(Boolean).join(' · ');
    if (meta) {
      children.push(new Paragraph({
        children: [new TextRun({ text: meta, italics: true, size: 22 })],
        spacing: { after: 400 },
      }));
    }

    // Render sections recursively
    function renderSection(section: any) {
      const level = section.level || 1;
      const headingLevel =
        level === 1 ? HeadingLevel.HEADING_1
        : level === 2 ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;

      if (section.heading) {
        children.push(new Paragraph({
          text: String(section.heading),
          heading: headingLevel,
          spacing: { before: level === 1 ? 400 : 200, after: 100 },
        }));
      }
      if (section.content) {
        for (const line of String(section.content).split('\n')) {
          children.push(new Paragraph({
            children: [new TextRun(line)],
            spacing: { after: 80 },
          }));
        }
      }
      if (Array.isArray(section.subsections)) {
        for (const sub of section.subsections) renderSection(sub);
      }
    }

    for (const section of data.sections) renderSection(section);

    // Footnotes
    if (Array.isArray(data.footnotes) && data.footnotes.length > 0) {
      children.push(new Paragraph({
        text: 'References',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 100 },
      }));
      for (const fn of data.footnotes) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${fn.ref || ''} `, bold: true }),
            new TextRun(String(fn.text || '')),
          ],
          spacing: { after: 60 },
        }));
      }
    }

    return buildDoc(children);
  }

  // ─── OPERATIONS schema ────────────────────────────────────────────────────
  if (data?.deliverable_content) {
    const dc = data.deliverable_content;
    addTitle(children, buildTitle(data, 'Operations Report'));
    addSummary(children, dc.summary);

    if (dc.sections && typeof dc.sections === 'object') {
      for (const [sectionKey, sectionVal] of Object.entries(dc.sections)) {
        addHeading2(children, formatKey(sectionKey));
        renderValue(children, sectionVal);
      }
    }
    return buildDoc(children);
  }

  // ─── SALES schema ────────────────────────────────────────────────────────
  if (data?.output && data?.department === 'SALES') {
    const out = data.output;
    addTitle(children, buildTitle(data, 'Sales Strategy'));
    addSummary(children, out.summary);
    renderKeyedSection(children, 'Objectives', out.objectives);
    renderKeyedSection(children, 'Strategies', out.strategies);
    if (out.metrics) renderKeyedSection(children, 'Metrics', out.metrics);
    if (out.timeline) {
      addHeading2(children, 'Timeline');
      addBody(children, String(out.timeline));
    }
    return buildDoc(children);
  }

  // ─── MARKETING schema ────────────────────────────────────────────────────
  if (data?.strategy && data?.department === 'MARKETING') {
    const strat = data.strategy;
    addTitle(children, buildTitle(data, 'Marketing Strategy'));
    addSummary(children, strat.summary);
    if (strat.target_audience) renderKeyedSection(children, 'Target Audience', strat.target_audience);
    if (strat.key_messages) renderKeyedSection(children, 'Key Messages', strat.key_messages);
    if (strat.channels) renderKeyedSection(children, 'Channels', strat.channels);
    if (strat.budget_allocation) renderKeyedSection(children, 'Budget Allocation', strat.budget_allocation);
    if (strat.success_metrics) renderKeyedSection(children, 'Success Metrics', strat.success_metrics);
    return buildDoc(children);
  }

  // ─── FINANCE schema (narrative version) ──────────────────────────────────
  if (data?.analysis && data?.department === 'FINANCE') {
    const ana = data.analysis;
    addTitle(children, buildTitle(data, 'Financial Analysis'));
    addSummary(children, ana.summary);
    if (ana.financial_framework) renderKeyedSection(children, 'Financial Framework', ana.financial_framework);
    if (ana.key_assumptions) renderKeyedSection(children, 'Key Assumptions', ana.key_assumptions);
    if (ana.recommendations) renderKeyedSection(children, 'Recommendations', ana.recommendations);
    if (ana.kpis) renderKeyedSection(children, 'KPIs', ana.kpis);
    return buildDoc(children);
  }

  // ─── Legacy email schemas ─────────────────────────────────────────────────
  const template = data?.refined_email_template || data?.email_template;
  if (template || (data?.subject && data?.body)) {
    const src = template || data;
    const subject = src?.subject || src?.Subject;
    const body = src?.body || src?.Body || src?.content || '';
    if (subject) {
      children.push(new Paragraph({
        text: `Subject: ${subject}`,
        heading: HeadingLevel.HEADING_2,
      }));
    }
    for (const line of String(body).split('\n')) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
    return buildDoc(children);
  }

  // ─── Generic fallback — any JSON ─────────────────────────────────────────
  addTitle(children, buildTitle(data, 'Department Output'));
  renderValue(children, data);
  return buildDoc(children);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDoc(children: Paragraph[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

function buildTitle(data: any, fallback: string): string {
  const dept = data?.department ? `${formatKey(data.department)} ` : '';
  return `${dept}${fallback}`;
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function addTitle(children: Paragraph[], text: string) {
  children.push(new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
  }));
}

function addHeading2(children: Paragraph[], text: string) {
  children.push(new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
  }));
}

function addSummary(children: Paragraph[], summary: string | undefined) {
  if (!summary) return;
  children.push(new Paragraph({
    children: [new TextRun({ text: String(summary), italics: true, size: 26 })],
    spacing: { after: 300 },
  }));
}

function addBody(children: Paragraph[], text: string) {
  for (const line of text.split('\n')) {
    children.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 80 } }));
  }
}

function addBullet(children: Paragraph[], text: string) {
  children.push(new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun(text)],
    spacing: { after: 60 },
  }));
}

/** Render any value under a section heading */
function renderKeyedSection(children: Paragraph[], label: string, value: any) {
  addHeading2(children, label);
  renderValue(children, value);
}

/** Recursively render a value — array, object, or primitive */
function renderValue(children: Paragraph[], value: any, depth: number = 0) {
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    addBody(children, value);
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    addBody(children, String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        addBullet(children, item);
      } else if (typeof item === 'object' && item !== null) {
        renderValue(children, item, depth + 1);
      } else {
        addBullet(children, String(item));
      }
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // Skip internal / metadata fields
      if (['task_id', 'department', 'status'].includes(k)) continue;

      if (depth === 0) {
        // Top-level keys that are themselves objects → sub-heading
        if (typeof v === 'object' && v !== null) {
          addHeading2(children, formatKey(k));
          renderValue(children, v, depth + 1);
        } else {
          addBody(children, `${formatKey(k)}: ${v}`);
        }
      } else {
        // Nested — use bold inline label
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `${formatKey(k)}: `, bold: true }),
              new TextRun(String(v)),
            ],
            spacing: { after: 60 },
          }));
        } else if (Array.isArray(v)) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `${formatKey(k)}:`, bold: true })],
            spacing: { after: 40 },
          }));
          renderValue(children, v, depth + 1);
        } else if (typeof v === 'object' && v !== null) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `${formatKey(k)}:`, bold: true })],
            spacing: { after: 40 },
          }));
          renderValue(children, v, depth + 1);
        }
      }
    }
  }
}
