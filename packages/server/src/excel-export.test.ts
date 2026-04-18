import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import type { ProjectExcelExportData } from './excel-export.js';

async function loadWorkbook(data: ProjectExcelExportData) {
  const { buildProjectExcelExportBuffer } = await import(new URL('./excel-export.ts', import.meta.url).href);
  const buffer = await buildProjectExcelExportBuffer(data);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

describe('buildProjectExcelExportBuffer', () => {
  it('renders compact period headers, white chart area, short links, and separators', async () => {
    const workbook = await loadWorkbook({
      projectName: 'Demo',
      tasks: [
        {
          id: 'parent',
          name: 'Этап 1',
          parentId: null,
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          sortOrder: 1,
          color: '#94A3B8',
          dependencies: [],
        },
        {
          id: 'child-a',
          name: 'Подготовка',
          parentId: 'parent',
          startDate: '2026-04-01',
          endDate: '2026-04-02',
          sortOrder: 1,
          color: '#22C55E',
          dependencies: [],
        },
        {
          id: 'child-b',
          name: 'Монтаж',
          parentId: 'parent',
          startDate: '2026-04-03',
          endDate: '2026-04-05',
          sortOrder: 2,
          color: '#2563EB',
          dependencies: [
            {
              predecessorTaskId: 'child-a',
              predecessorTaskName: 'Подготовка',
              type: 'FS',
              lag: 2,
            },
            {
              predecessorTaskId: 'missing',
              predecessorTaskName: null,
              type: 'SS',
              lag: 0,
            },
          ],
        },
      ],
    });

    const sheet = workbook.getWorksheet('Gantt');
    assert.ok(sheet);
    assert.equal(sheet.views[0]?.showGridLines, false);
    assert.equal(sheet.getCell('A3').value, '№');
    assert.equal(sheet.getCell('B3').value, 'Задача');
    assert.equal(sheet.getCell('C3').value, 'Связи');
    assert.equal(sheet.getCell('G1').value, '2026');
    assert.equal(sheet.getCell('H1').value, '');
    assert.equal(sheet.getCell('G2').value, 'Апрель');
    assert.equal(sheet.getCell('H2').value, '');
    assert.equal(sheet.getCell('G3').value, '01');

    assert.equal(sheet.getCell('A4').value, '1');
    assert.equal(sheet.getCell('B4').value, 'Этап 1');
    assert.equal(sheet.getCell('B4').font?.bold, true);
    assert.equal(sheet.getCell('A5').value, '1.1');
    assert.equal(sheet.getCell('B5').value, 'Подготовка');
    assert.equal(sheet.getCell('B5').alignment?.indent, 1);
    assert.equal(sheet.getCell('A6').value, '1.2');
    assert.equal(sheet.getCell('C6').value, '[1.1]ОН+2, [missing]НН');
    assert.equal(sheet.getCell('F6').value, 3);
    assert.equal(sheet.getCell('I6').fill?.type, 'pattern');
    assert.equal(sheet.getCell('K6').fill?.type, 'pattern');
    assert.equal(sheet.getCell('L6').fill, undefined);
    assert.equal((sheet.getCell('G4').border as any)?.left?.color?.argb, 'FF64748B');
    assert.ok((sheet.getRow(6).height ?? 0) >= 20);
    assert.equal(sheet.getCell('C6').alignment?.wrapText, true);
  });

  it('produces an empty-state workbook when the project has no tasks', async () => {
    const workbook = await loadWorkbook({
      projectName: 'Empty',
      tasks: [],
    });

    const sheet = workbook.getWorksheet('Gantt');
    assert.ok(sheet);
    assert.equal(sheet.getCell('B4').value, 'Нет задач');
  });
});
