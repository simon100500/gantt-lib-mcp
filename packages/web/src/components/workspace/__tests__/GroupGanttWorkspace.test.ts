import { describe, expect, it } from 'vitest';

import type { GroupGanttOverviewResponse } from '../../../lib/apiTypes.ts';
import { buildTasks } from '../GroupGanttWorkspace.tsx';

describe('GroupGanttWorkspace buildTasks', () => {
  const payload: GroupGanttOverviewResponse = {
    group: {
      id: 'group-1',
      name: 'Group 1',
    },
    projects: [
      {
        id: 'project-1',
        name: 'Project 1',
        status: 'active',
        ganttDayMode: 'calendar',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        progress: 40,
        taskCount: 4,
        sectionCount: 3,
        sections: [
          {
            taskId: 'section-parent',
            name: 'Section Parent',
            startDate: '2026-04-01',
            endDate: '2026-04-20',
            progress: 30,
            color: '#ff0000',
            children: [
              {
                taskId: 'subsection-leaf',
                name: 'Subsection Leaf',
                startDate: '2026-04-02',
                endDate: '2026-04-10',
                progress: 20,
                color: '#00ff00',
              },
            ],
          },
          {
            taskId: 'section-leaf',
            name: 'Section Leaf',
            startDate: '2026-04-05',
            endDate: '2026-04-15',
            progress: 60,
            color: '#123456',
          },
        ],
      },
    ],
  };

  it('colors only second-level parent tasks gray in overview mode', () => {

    const tasks = buildTasks(payload, 3);
    const parentSection = tasks.find((task) => task.id === 'section:project-1:section-parent');
    const leafSection = tasks.find((task) => task.id === 'section:project-1:section-leaf');
    const subsection = tasks.find((task) => task.id === 'section:project-1:subsection-leaf');
    const project = tasks.find((task) => task.id === 'project:project-1');

    expect(parentSection).toMatchObject({
      overviewDepth: 2,
      color: '#6B778C',
    });
    expect(leafSection).toMatchObject({
      overviewDepth: 2,
      color: '#123456',
    });
    expect(subsection).toMatchObject({
      overviewDepth: 3,
      color: '#00ff00',
    });
    expect(project).toMatchObject({
      overviewDepth: 1,
    });
    expect(project?.color).toBeUndefined();
  });

  it('limits overview tasks to level 2 when requested', () => {
    const tasks = buildTasks(payload, 2);

    expect(tasks.map((task) => task.id)).toEqual([
      'project:project-1',
      'section:project-1:section-parent',
      'section:project-1:section-leaf',
    ]);
    expect(tasks.some((task) => task.overviewDepth === 3)).toBe(false);
  });

  it('limits overview tasks to projects only when requested', () => {
    const tasks = buildTasks(payload, 1);

    expect(tasks.map((task) => task.id)).toEqual([
      'project:project-1',
    ]);
    expect(tasks.every((task) => task.overviewDepth === 1)).toBe(true);
  });
});
