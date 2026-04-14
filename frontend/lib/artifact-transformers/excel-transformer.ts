import * as xlsx from 'xlsx';

export async function transformToExcel(data: any): Promise<Buffer> {
  const workbook = xlsx.utils.book_new();

  // Handle battle plan / comprehensive content (nested structure)
  if (data?.deliverable_content?.content_for_excel) {
    const content = data.deliverable_content.content_for_excel;
    const excelSheetName = data.deliverable_content.excel_sheet_name || 'Battle Plan';

    // Create sheets for each major section
    const sections = Object.keys(content);

    for (let i = 0; i < sections.length; i++) {
      const sectionName = sections[i];
      const sectionData = content[sectionName];
      let sheetData: any[] = [];

      if (typeof sectionData === 'string') {
        // Simple string content
        sheetData = [{ [sectionName]: sectionData }];
      } else if (Array.isArray(sectionData)) {
        // Array of items
        sheetData = sectionData;
      } else if (typeof sectionData === 'object' && sectionData !== null) {
        // Nested object - flatten it
        const flattenObject = (obj: any, prefix = ''): any[] => {
          const result: any[] = [];
          for (const [key, val] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (Array.isArray(val)) {
              result.push(...val.map((item: any) => ({ [fullKey]: JSON.stringify(item) })));
            } else if (typeof val === 'object' && val !== null) {
              result.push(...flattenObject(val, fullKey));
            } else {
              result.push({ [fullKey]: val });
            }
          }
          return result;
        };
        sheetData = flattenObject(sectionData);
      }

      // Add to workbook with truncated sheet name (Excel limit is 31 chars)
      const sanitizedName = sectionName.substring(0, 31).replace(/[^\w\s]/g, '');
      const worksheet = xlsx.utils.json_to_sheet(sheetData.length > 0 ? sheetData : [{ [sectionName]: 'No data' }]);
      xlsx.utils.book_append_sheet(workbook, worksheet, sanitizedName || `Sheet${i + 1}`);
    }

    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // Handle simple research findings
  let doc = data?.research_findings || data?.research || data;
  let items = Array.isArray(doc) ? doc : (doc?.data && Array.isArray(doc.data) ? doc.data : null);

  if (!items) {
    items = [doc];
  }

  const worksheet = xlsx.utils.json_to_sheet(items);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Data");

  // Return buffer
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
