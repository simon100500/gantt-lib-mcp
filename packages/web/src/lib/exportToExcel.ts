import * as XLSX from 'xlsx';
import type { Task, TaskDependency } from '../types';

export type ExcelDetailLevel = 'brief' | 'standard' | 'full';

interface ExportOptions {
  tasks: Task[];
  projectName: string;
  detailLevel: ExcelDetailLevel;
}

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatDependencies(deps?: TaskDependency[]): string {
  if (!deps || deps.length === 0) return '';
  return deps.map((dep) => `${dep.taskId} (${dep.type}${dep.lag ? ` +${dep.lag}д` : ''})`).join(', ');
}

function buildTaskNameMap(tasks: Task[]): Map<string, string> {
  const idToName = new Map<string, string>();
  for (const task of tasks) {
    idToName.set(task.id, task.name);
  }
  return idToName;
}

export function exportToExcel({ tasks, projectName, detailLevel }: ExportOptions): void {
  const idToName = buildTaskNameMap(tasks);

  const headerBrief = ['#', 'Название', 'Начало', 'Конец'];
  const headerStandard = [...headerBrief, 'Прогресс (%)', 'Тип', 'Родитель'];
  const headerFull = [...headerStandard, 'Зависимости', 'Порядок'];

  const headers = detailLevel === 'brief' ? headerBrief : detailLevel === 'standard' ? headerStandard : headerFull;

  const rows = tasks.map((task, index) => {
    const base = [
      index + 1,
      task.name,
      formatDate(task.startDate),
      formatDate(task.endDate),
    ];

    if (detailLevel === 'brief') return base;

    const standard = [
      ...base,
      task.progress ?? 0,
      task.type === 'milestone' ? 'Веха' : 'Задача',
      task.parentId ? (idToName.get(task.parentId) ?? task.parentId) : '',
    ];

    if (detailLevel === 'standard') return standard;

    return [
      ...standard,
      formatDependencies(task.dependencies),
      task.sortOrder ?? '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const colWidths = headers.map((header, colIndex) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => String(row[colIndex] ?? '').length),
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'График');

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('-');
  const fileName = `ГетГант - ${projectName} - ${timestamp}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
