import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AuthService } from './auth.service.js';

type ShareLinkRow = {
  id: string;
  projectId: string;
  label: string;
  scope: 'project' | 'task_selection';
  includedTaskIds: string[];
  revokedAt: Date | null;
  createdAt: Date;
};

function createServiceHarness() {
  const rows: ShareLinkRow[] = [
    {
      id: 'legacy-project',
      projectId: 'project-1',
      label: 'Whole project',
      scope: 'project',
      includedTaskIds: [],
      revokedAt: null,
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
    },
    {
      id: 'scoped-old',
      projectId: 'project-1',
      label: 'Scoped old',
      scope: 'task_selection',
      includedTaskIds: ['task-1', 'task-2'],
      revokedAt: new Date('2026-05-01T12:00:00.000Z'),
      createdAt: new Date('2026-05-01T11:00:00.000Z'),
    },
  ];

  const prisma = {
    shareLink: {
      findMany: async ({ where, orderBy }: any) => rows
        .filter((row) => row.projectId === where.projectId)
        .sort((left, right) => {
          if (orderBy?.[0]?.createdAt === 'desc') {
            return right.createdAt.getTime() - left.createdAt.getTime();
          }
          return left.createdAt.getTime() - right.createdAt.getTime();
        }),
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
      findFirst: async ({ where }: any) => rows.find((row) => (
        (where.id === undefined || row.id === where.id)
        && (where.projectId === undefined || row.projectId === where.projectId)
        && (where.revokedAt === undefined || row.revokedAt === where.revokedAt)
      )) ?? null,
      create: async ({ data }: any) => {
        if (rows.some((row) => row.id === data.id)) {
          throw new Error('duplicate');
        }

        const created: ShareLinkRow = {
          id: data.id,
          projectId: data.projectId,
          label: data.label,
          scope: data.scope,
          includedTaskIds: data.includedTaskIds,
          revokedAt: null,
          createdAt: new Date('2026-05-02T09:00:00.000Z'),
        };
        rows.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) {
          throw new Error(`row ${where.id} not found`);
        }
        row.revokedAt = data.revokedAt;
        return row;
      },
    },
  };

  const service: any = new AuthService();
  (service as any).prisma = prisma;
  return { service, rows };
}

describe('AuthService share links', () => {
  let service: any;
  let rows: ShareLinkRow[];

  beforeEach(() => {
    ({ service, rows } = createServiceHarness());
  });

  it('lists share links newest first with domain mapping', async () => {
    const links = await service.listShareLinks('project-1');

    assert.equal(links.length, 2);
    assert.equal(links[0]?.id, 'scoped-old');
    assert.equal(links[0]?.revokedAt, '2026-05-01T12:00:00.000Z');
    assert.deepEqual(links[0]?.includedTaskIds, ['task-1', 'task-2']);
  });

  it('creates task-selection links with deduplicated task ids', async () => {
    const link = await service.createShareLink({
      projectId: 'project-1',
      label: 'Partial',
      scope: 'task_selection',
      includedTaskIds: ['task-1', 'task-1', 'task-2', ''],
    });

    assert.equal(link.projectId, 'project-1');
    assert.equal(link.label, 'Partial');
    assert.equal(link.scope, 'task_selection');
    assert.deepEqual(link.includedTaskIds, ['task-1', 'task-2']);
    assert.equal(rows.length, 3);
  });

  it('finds only active links through active lookup', async () => {
    const active = await service.findActiveShareLinkById('legacy-project');
    const revoked = await service.findActiveShareLinkById('scoped-old');

    assert.equal(active?.id, 'legacy-project');
    assert.equal(revoked, null);
  });

  it('revokes an active link idempotently', async () => {
    const first = await service.revokeShareLink('legacy-project', 'project-1');
    const second = await service.revokeShareLink('legacy-project', 'project-1');

    assert.ok(first?.revokedAt);
    assert.equal(second?.revokedAt, first?.revokedAt);
  });
});
