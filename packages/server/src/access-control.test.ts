import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  resetAccessControlPrismaGetterForTests,
  resolveGroupAccess,
  resolveProjectAccess,
  setAccessControlPrismaGetterForTests,
} from './access-control.js';

const prismaState: any = {
  projectGroup: {
    findUnique: async () => null,
  },
  projectGroupMember: {
    findUnique: async () => null,
  },
  project: {
    findFirst: async () => null,
  },
};

setAccessControlPrismaGetterForTests(() => prismaState);

describe('access-control', () => {
  afterEach(() => {
    prismaState.projectGroup.findUnique = async () => null;
    prismaState.projectGroupMember.findUnique = async () => null;
    prismaState.project.findFirst = async () => null;
    resetAccessControlPrismaGetterForTests();
    setAccessControlPrismaGetterForTests(() => prismaState);
  });

  it('treats project-group owner as owner with edit rights', async () => {
    prismaState.projectGroup.findUnique = async () => ({
      id: 'group-1',
      userId: 'owner-1',
    });

    const access = await resolveGroupAccess('owner-1', 'group-1');
    assert.deepEqual(access, {
      role: 'owner',
      canEdit: true,
      permissions: { schedule: 'edit', resources: 'edit', finance: 'edit' },
      ownerUserId: 'owner-1',
      billingUserId: 'owner-1',
      groupId: 'group-1',
    });
  });

  it('resolves viewer membership as read-only', async () => {
    prismaState.projectGroup.findUnique = async () => ({
      id: 'group-1',
      userId: 'owner-1',
    });
    prismaState.projectGroupMember.findUnique = async () => ({
      role: 'viewer',
      scheduleAccess: 'view',
      resourcesAccess: 'view',
      financeAccess: 'view',
    });

    const access = await resolveGroupAccess('viewer-1', 'group-1');
    assert.deepEqual(access, {
      role: 'viewer',
      canEdit: false,
      permissions: { schedule: 'view', resources: 'view', finance: 'view' },
      ownerUserId: 'owner-1',
      billingUserId: 'owner-1',
      groupId: 'group-1',
    });
  });

  it('resolves project access through group membership when project owner differs', async () => {
    prismaState.project.findFirst = async () => ({
      userId: 'owner-1',
      groupId: 'group-1',
    });
    prismaState.projectGroup.findUnique = async () => ({
      id: 'group-1',
      userId: 'owner-1',
    });
    prismaState.projectGroupMember.findUnique = async () => ({
      role: 'editor',
      scheduleAccess: 'edit',
      resourcesAccess: 'edit',
      financeAccess: 'edit',
    });

    const access = await resolveProjectAccess('editor-1', 'project-1');
    assert.deepEqual(access, {
      role: 'editor',
      canEdit: true,
      permissions: { schedule: 'edit', resources: 'edit', finance: 'edit' },
      ownerUserId: 'owner-1',
      billingUserId: 'owner-1',
      groupId: 'group-1',
    });
  });
});
