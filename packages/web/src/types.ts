export interface TaskDependency {
  taskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag?: number;
}

export interface Task {
  id: string;
  name: string;
  startDate: string | Date;   // YYYY-MM-DD string or Date object (gantt-lib compatible)
  endDate: string | Date;     // YYYY-MM-DD string or Date object (gantt-lib compatible)
  color?: string;
  progress?: number;
  dependencies?: TaskDependency[];
}
