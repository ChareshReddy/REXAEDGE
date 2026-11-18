import * as XLSX from 'xlsx';

export function createSampleBulkCreateFile() {
  const mats = [
    'A1BH0214C', 'B2CH0315D', 'C3DH0416E', 'D4EH0517F', 'E5FH0618G',
    'F6GH0719H', 'G7HH0820I', 'H8IH0921J', 'I9JH1022K', 'J0KH1123L',
    'K1LH1224M', 'L2MH1325N', 'M3NH1426O', 'N4OH1527P'
  ];
  const data = mats.map((mat, idx) => ({
    Material: mat,
    Plant: '1010',
    Component: 'C3DH0416E',
    Quantity: (idx + 1) * 2,
    'Storage Location': '0001',
    'BOM Usage': '1',
    'Alternative BOM': '01',
    'Item Category': 'L',
    'Valid From': '01.01.2026',
    'Base Qty': 1,
    'BOM Status': '01'
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function createSampleBulkCopyFile() {
  const data = [
    {
      'Source Material': 'A1BH0214C',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'A1BH0214C',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'B2CH0315D',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'B2CH0315D',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
