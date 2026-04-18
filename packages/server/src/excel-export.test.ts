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
  it('renders headers, hierarchy, links, and timeline fill', async () => {
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
    assert.equal(sheet.getCell('A1').value, 'Задача');
    assert.equal(sheet.getCell('B1').value, 'Связи');
    assert.equal(sheet.getCell('C1').value, 'Начало');
    assert.equal(sheet.getCell('F1').value, '01.04');

    assert.equal(sheet.getCell('A2').value, 'Этап 1');
    assert.equal(sheet.getCell('A2').font?.bold, true);
    assert.equal(sheet.getCell('A3').value, 'Подготовка');
    assert.equal(sheet.getCell('A3').alignment?.indent, 1);
    assert.equal(sheet.getCell('B4').value, 'Подготовка (FS+2), missing (SS)');
    assert.equal(sheet.getCell('E4').value, 3);
    assert.equal(sheet.getCell('H4').fill?.type, 'pattern');
    assert.equal(sheet.getCell('J4').fill?.type, 'pattern');
  });

  it('produces an empty-state workbook when the project has no tasks', async () => {
    const workbook = await loadWorkbook({
      projectName: 'Empty',
      tasks: [],
    });

    const sheet = workbook.getWorksheet('Gantt');
    assert.ok(sheet);
    assert.equal(sheet.getCell('A1').value, 'Задача');
    assert.equal(sheet.getCell('A2').value, 'Нет задач');
  });
});
