import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';

async function createImportFile(rows: Array<Array<string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Импорт');
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

describe('excel import preview', () => {
  it('parses WBS hierarchy and Russian dependency syntax from the first worksheet', async () => {
    const { buildExcelImportPreview } = await import(new URL('./excel-import.ts', import.meta.url).href);
    const fileBase64 = await createImportFile([
      ['Уровень структуры', 'Название задачи', 'Дата начала', 'Дата окончания', 'Связи', 'Ресурсы'],
      [1, 'Этап 1', '2026-05-10', '2026-05-12', '', ''],
      [2, 'Работа 1', '2026-05-10', '2026-05-11', '', 'Бригада 1'],
      [2, 'Работа 2', '2026-05-12', '2026-05-12', '2ОН, 1НН+3', 'Экскаватор; Бригада 2'],
    ]);

    const preview = await buildExcelImportPreview({
      fileName: 'import.xlsx',
      fileBase64,
    });

    assert.equal(preview.rows.length, 3);
    assert.equal(preview.rows[0]?.normalized.wbsLevel, 1);
    assert.equal(preview.rows[1]?.normalized.parentImportIndex, 1);
    assert.deepEqual(preview.rows[2]?.normalized.dependencyLabels, ['2ОН', '1НН+3']);
    assert.deepEqual(preview.rows[2]?.normalized.resourceNames, ['Экскаватор', 'Бригада 2']);
    assert.equal(preview.issues.filter((issue) => issue.severity === 'error').length, 0);
  });

  it('reports invalid WBS jumps and malformed Russian dependencies as validation errors', async () => {
    const { buildExcelImportPreview } = await import(new URL('./excel-import.ts', import.meta.url).href);
    const fileBase64 = await createImportFile([
      ['Уровень структуры', 'Название задачи', 'Дата начала', 'Дата окончания', 'Связи'],
      [1, 'Этап 1', '2026-05-10', '2026-05-12', ''],
      [3, 'Слишком глубокая', '2026-05-10', '2026-05-11', '1FS'],
    ]);

    const preview = await buildExcelImportPreview({
      fileName: 'invalid.xlsx',
      fileBase64,
    });

    assert.match(preview.issues.map((issue) => issue.message).join('\n'), /прыгать/u);
    assert.match(preview.issues.map((issue) => issue.message).join('\n'), /Используйте формат вроде "1ОН" или "2НН\+12"/u);
  });
});
