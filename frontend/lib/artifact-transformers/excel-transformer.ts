import * as xlsx from 'xlsx';

export async function transformToExcel(data: any): Promise<Buffer> {
  let doc = data?.research_findings || data?.research || data;
  let items = Array.isArray(doc) ? doc : (doc?.data && Array.isArray(doc.data) ? doc.data : null);
  
  if (!items) {
    items = [doc];
  }

  const worksheet = xlsx.utils.json_to_sheet(items);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Data");
  
  // Return buffer
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
