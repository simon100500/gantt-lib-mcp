import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { buildBackupDownloadFileName, parseProjectBackupFile } from './project-backup.js';

const validBackup = {
  format: 'gantt-project-backup',
  version: 1,
  exportedAt: '2026-05-08T10:00:00.000Z',
  source: {
    projectId: 'source-project',
    userId: 'user-1',
    groupId: 'group-1',
  },
  project: {
    name: 'Backup Demo',
    ganttDayMode: 'business',
    calendarDays: [
      { date: '2026-05-08', kind: 'working' },
    ],
    timelineMarkers: [
      { date: '2026-05-09', name: 'Milestone', color: '#ff0000' },
    ],
  },
  data: {
    tasks: [
      {
        backupId: 'task-root',
        name: 'Root',
        startDate: '2026-05-08',
        endDate: '2026-05-10',
        type: 'task',
        color: null,
        parentBackupId: null,
        status: 'in_progress',
        progress: 50,
        workVolume: 12,
        workUnit: 'h',
        completedVolume: 6,
        sortOrder: 1,
      },
      {
        backupId: 'task-child',
        name: 'Child',
        startDate: '2026-05-09',
        endDate: '2026-05-10',
        type: 'milestone',
        color: '#00ff00',
        parentBackupId: 'task-root',
        status: 'not_started',
        progress: 0,
        workVolume: null,
        workUnit: null,
        completedVolume: 0,
        sortOrder: 2,
      },
    ],
    dependencies: [
      {
        backupId: 'dep-1',
        taskBackupId: 'task-child',
        depTaskBackupId: 'task-root',
        type: 'FS',
        lag: 0,
      },
    ],
    resources: [
      {
        backupId: 'resource-1',
        name: 'Foreman',
        type: 'human',
        scope: 'project',
        isActive: true,
        deactivatedAt: null,
      },
    ],
    assignments: [
      {
        taskBackupId: 'task-child',
        resourceBackupId: 'resource-1',
        createdAt: '2026-05-08T10:00:00.000Z',
      },
    ],
    progressEntries: [
      {
        taskBackupId: 'task-root',
        entryDate: '2026-05-08',
        amount: 3,
        createdAt: '2026-05-08T10:00:00.000Z',
        updatedAt: '2026-05-08T10:05:00.000Z',
      },
    ],
    financeSettings: [
      {
        taskBackupId: 'task-root',
        plannedCost: 1000,
        currencyCode: 'RUB',
        allocationMode: 'manual',
        allocationParentTaskBackupId: null,
        createdAt: '2026-05-08T10:00:00.000Z',
        updatedAt: '2026-05-08T10:05:00.000Z',
      },
    ],
    fundingEvents: [
      {
        taskBackupId: 'task-root',
        eventDate: '2026-05-10',
        amount: 500,
        comment: 'Advance',
        createdAt: '2026-05-08T10:00:00.000Z',
        updatedAt: '2026-05-08T10:05:00.000Z',
      },
    ],
    baselines: [
      {
        backupId: 'baseline-1',
        name: 'Plan A',
        source: 'current',
        sourceHistoryGroupId: null,
        createdAt: '2026-05-08T10:00:00.000Z',
        tasks: [
          {
            taskBackupId: 'task-root',
            name: 'Root',
            startDate: '2026-05-08',
            endDate: '2026-05-11',
            type: 'task',
            color: null,
            progress: 0,
            parentTaskBackupId: null,
            sortOrder: 1,
          },
        ],
        dependencies: [],
      },
    ],
  },
};

describe('project backup', () => {
  it('parses a valid backup payload including baselines', () => {
    const parsed = parseProjectBackupFile(validBackup);
    assert.equal(parsed.project.name, 'Backup Demo');
    assert.equal(parsed.data.tasks.length, 2);
    assert.equal(parsed.data.assignments[0].resourceBackupId, 'resource-1');
    assert.equal(parsed.data.baselines[0].name, 'Plan A');
  });

  it('rejects broken cross-references', () => {
    const broken = structuredClone(validBackup);
    broken.data.assignments[0].resourceBackupId = 'missing-resource';
    assert.throws(() => parseProjectBackupFile(broken), /Assignment references missing task or resource/);
  });

  it('builds a stable download file name', () => {
    const fileName = buildBackupDownloadFileName('Demo / Project', new Date('2026-05-08T12:34:00.000Z'));
    assert.equal(fileName, 'Demo Project - backup 2026-05-08 12-34.gantt.json');
  });
});
