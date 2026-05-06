import { useEffect, useMemo, useState } from 'react';
import { Crown, Eye, EyeOff, Loader2, Mail, Pencil, Shield, Trash2, UserPlus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../stores/useAuthStore.ts';
import type {
  ProjectGroup,
  ProjectGroupInvite,
  ProjectGroupMember,
  ProjectGroupMembersPayload,
  ProjectGroupMemberRole,
  ProjectSectionAccessLevel,
  ProjectSectionPermissions,
} from '../types.ts';

interface ProjectGroupMembersModalProps {
  group: ProjectGroup;
  onClose: () => void;
}

type EditableRole = Exclude<ProjectGroupMemberRole, 'owner'>;
type PermissionSection = keyof ProjectSectionPermissions;

const SECTION_LABELS: Array<{ key: PermissionSection; label: string }> = [
  { key: 'schedule', label: 'График' },
  { key: 'resources', label: 'Ресурсы' },
  { key: 'finance', label: 'Финансы' },
];

function roleLabel(role: ProjectGroupMemberRole): string {
  if (role === 'owner') return 'Владелец';
  if (role === 'viewer') return 'Наблюдатель';
  return 'Редактор';
}

function roleFromPermissions(permissions: ProjectSectionPermissions): EditableRole {
  return SECTION_LABELS.every(({ key }) => permissions[key] === 'view') ? 'viewer' : 'editor';
}

function permissionSummary(permissions: ProjectSectionPermissions): string {
  if (SECTION_LABELS.every(({ key }) => permissions[key] === 'none')) {
    return 'Скрыто';
  }
  const role = roleFromPermissions(permissions);
  const isUniform = SECTION_LABELS.every(({ key }) => permissions[key] === permissions.schedule);
  if (isUniform) {
    return roleLabel(role);
  }
  return 'Гибкий доступ';
}

function PermissionsLegend() {
  return (
    <div className="grid grid-cols-[72px,96px,96px,96px] items-center gap-2 text-[11px] font-medium uppercase tracking-[0.03em] text-slate-500">
      <div />
      <div className="flex items-center justify-center gap-1">
        <EyeOff className="h-3.5 w-3.5" />
        <span>Скрыть</span>
      </div>
      <div className="flex items-center justify-center gap-1">
        <Eye className="h-3.5 w-3.5" />
        <span>Просмотр</span>
      </div>
      <div className="flex items-center justify-center gap-1">
        <Pencil className="h-3.5 w-3.5" />
        <span>Ред.</span>
      </div>
    </div>
  );
}

function PermissionsMatrix({
  value,
  disabled = false,
  onChange,
}: {
  value: ProjectSectionPermissions;
  disabled?: boolean;
  onChange: (value: ProjectSectionPermissions) => void;
}) {
  return (
    <div className="grid gap-2">
      {SECTION_LABELS.map((section) => (
        <div key={section.key} className="grid grid-cols-[72px,1fr] items-center gap-2">
          <div className="text-xs font-medium text-slate-500">{section.label}</div>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, [section.key]: 'none' })}
              className={cn(
                'inline-flex h-8 w-24 items-center justify-center rounded-md border transition',
                value[section.key] === 'none'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                disabled && 'cursor-not-allowed opacity-50',
              )}
              aria-pressed={value[section.key] === 'none'}
              title={`${section.label}: скрыть`}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, [section.key]: 'view' })}
              className={cn(
                'inline-flex h-8 w-24 items-center justify-center rounded-md border transition',
                value[section.key] === 'view'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                disabled && 'cursor-not-allowed opacity-50',
              )}
              aria-pressed={value[section.key] === 'view'}
              title={`${section.label}: просмотр`}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, [section.key]: 'edit' })}
              className={cn(
                'inline-flex h-8 w-24 items-center justify-center rounded-md border transition',
                value[section.key] === 'edit'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                disabled && 'cursor-not-allowed opacity-50',
              )}
              aria-pressed={value[section.key] === 'edit'}
              title={`${section.label}: редактирование`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberRow({
  member,
  canManage,
  pending,
  onPermissionsChange,
  onTransfer,
  onRemove,
}: {
  member: ProjectGroupMember;
  canManage: boolean;
  pending: boolean;
  onPermissionsChange: (permissions: ProjectSectionPermissions) => Promise<void>;
  onTransfer: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [permissions, setPermissions] = useState<ProjectSectionPermissions>(member.permissions);

  useEffect(() => {
    setPermissions(member.permissions);
  }, [member.permissions]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr),392px,88px,40px,40px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{member.email}</div>
        <div className="text-xs text-slate-500">Доступ с {new Date(member.createdAt).toLocaleDateString('ru-RU')}</div>
      </div>
      {canManage ? (
        <PermissionsMatrix
          value={permissions}
          disabled={pending}
          onChange={(nextPermissions) => {
            setPermissions(nextPermissions);
            void onPermissionsChange(nextPermissions).catch(() => {
              setPermissions(member.permissions);
            });
          }}
        />
      ) : (
        <div className="text-sm text-slate-600">{permissionSummary(member.permissions)}</div>
      )}
      <div className="text-xs text-slate-500">{permissionSummary(permissions)}</div>
      {canManage ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => { void onTransfer(); }}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition hover:bg-amber-50 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Передать владение ${member.email}`}
          title="Передать владение пространством"
        >
          <Crown className="h-4 w-4" />
        </button>
      ) : (
        <span className="h-9 w-9" />
      )}
      {canManage ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => { void onRemove(); }}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Удалить ${member.email}`}
          title="Удалить из пространства"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <span className="h-9 w-9" />
      )}
    </div>
  );
}

function InviteRow({
  invite,
  canManage,
  pending,
  onPermissionsChange,
  onRemove,
}: {
  invite: ProjectGroupInvite;
  canManage: boolean;
  pending: boolean;
  onPermissionsChange: (permissions: ProjectSectionPermissions) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [permissions, setPermissions] = useState<ProjectSectionPermissions>(invite.permissions);

  useEffect(() => {
    setPermissions(invite.permissions);
  }, [invite.permissions]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr),392px,88px,40px] items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{invite.email}</div>
        <div className="text-xs text-slate-500">
          Приглашение активно до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}
        </div>
      </div>
      {canManage ? (
        <PermissionsMatrix
          value={permissions}
          disabled={pending}
          onChange={(nextPermissions) => {
            setPermissions(nextPermissions);
            void onPermissionsChange(nextPermissions).catch(() => {
              setPermissions(invite.permissions);
            });
          }}
        />
      ) : (
        <div className="text-sm text-slate-600">{permissionSummary(invite.permissions)}</div>
      )}
      <div className="text-xs text-slate-500">{permissionSummary(permissions)}</div>
      {canManage ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => { void onRemove(); }}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Удалить приглашение ${invite.email}`}
          title="Удалить приглашение"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <span className="h-9 w-9" />
      )}
    </div>
  );
}

export function ProjectGroupMembersModal({ group, onClose }: ProjectGroupMembersModalProps) {
  const auth = useAuthStore();
  const [data, setData] = useState<ProjectGroupMembersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<ProjectSectionPermissions>({
    schedule: 'edit',
    resources: 'edit',
    finance: 'edit',
  });
  const [error, setError] = useState<string | null>(null);

  const canManage = group.accessRole === 'owner'
    || group.userId === auth.user?.id
    || data?.owner?.id === auth.user?.id;
  const ownerAndMembers = useMemo(() => {
    const rows: Array<{ key: string; email: string; role: ProjectGroupMemberRole; member?: ProjectGroupMember }> = [];
    if (data?.owner) {
      rows.push({ key: data.owner.id, email: data.owner.email, role: 'owner' });
    }
    for (const member of data?.members ?? []) {
      rows.push({ key: member.userId, email: member.email, role: member.role, member });
    }
    return rows;
  }, [data]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await auth.fetchProjectGroupMembers(group.id);
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить участников');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [group.id]);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Укажите email');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await auth.inviteProjectGroupMember(group.id, {
        email: normalizedEmail,
        role: roleFromPermissions(invitePermissions),
        permissions: invitePermissions,
      });
      setEmail('');
      await load();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Не удалось отправить приглашение');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <Card className="relative w-[720px] max-w-[calc(100vw-2rem)] rounded-2xl border-0 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-slate-600"
          aria-label="Закрыть"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <CardHeader className="space-y-2 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <Users className="h-5 w-5" />
            Команда группы проектов
          </CardTitle>
          <CardDescription className="pr-10">
            {group.name}. Для каждой вкладки можно отдельно задать просмотр или редактирование.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {canManage ? <PermissionsLegend /> : null}
          {canManage ? (
            <form onSubmit={handleInvite} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <UserPlus className="h-4 w-4" />
                Пригласить коллегу
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr),392px,auto]">
                <div className="space-y-2">
                  <Label htmlFor="group-invite-email">Email</Label>
                  <Input
                    id="group-invite-email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={saving}
                    className={cn('h-10', error && !email.trim() && 'border-destructive focus-visible:ring-destructive')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="group-invite-role">Права</Label>
                  <div id="group-invite-role">
                    <PermissionsMatrix value={invitePermissions} disabled={saving} onChange={setInvitePermissions} />
                  </div>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={saving} className="h-10 w-full sm:w-auto">
                    {saving ? 'Отправка...' : 'Пригласить'}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка участников...
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Shield className="h-4 w-4 text-slate-500" />
                  Команда
                </div>
                <div className="space-y-2">
                  {ownerAndMembers.map((row) => (
                    row.role === 'owner' ? (
                      <div key={row.key} className="grid grid-cols-[minmax(0,1fr),392px,88px,40px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">{row.email}</div>
                          <div className="text-xs text-slate-500">Основной владелец пространства</div>
                        </div>
                        <div className="text-sm text-slate-600">{roleLabel(row.role)}</div>
                        <div className="text-xs text-slate-500">Полный доступ</div>
                        <span className="h-9 w-9" />
                      </div>
                    ) : row.member ? (
                      <MemberRow
                        key={row.key}
                        member={row.member}
                        canManage={canManage}
                        pending={saving}
                        onPermissionsChange={async (permissions) => {
                          setSaving(true);
                          setError(null);
                          try {
                            await auth.updateProjectGroupMember(group.id, row.member!.userId, {
                              role: roleFromPermissions(permissions),
                              permissions,
                            });
                            await load();
                          } catch (updateError) {
                            setError(updateError instanceof Error ? updateError.message : 'Не удалось обновить роль');
                            throw updateError;
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onTransfer={async () => {
                          const confirmed = window.confirm(`Передать владение пространством пользователю ${row.member!.email}? Вы останетесь редактором.`);
                          if (!confirmed) {
                            return;
                          }

                          setSaving(true);
                          setError(null);
                          try {
                            await auth.transferProjectGroupOwner(group.id, row.member!.userId);
                            await load();
                          } catch (transferError) {
                            setError(transferError instanceof Error ? transferError.message : 'Не удалось передать владение');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onRemove={async () => {
                          setSaving(true);
                          setError(null);
                          try {
                            await auth.removeProjectGroupMember(group.id, row.member!.userId);
                            await load();
                          } catch (removeError) {
                            setError(removeError instanceof Error ? removeError.message : 'Не удалось удалить участника');
                          } finally {
                            setSaving(false);
                          }
                        }}
                      />
                    ) : null
                  ))}
                  {ownerAndMembers.length === 1 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                      Кроме владельца пока никого нет.
                    </div>
                  ) : null}
                </div>
              </section>

              {canManage ? (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <Mail className="h-4 w-4 text-slate-500" />
                    Ожидают подтверждения
                  </div>
                  <div className="space-y-2">
                    {data?.invites.length ? data.invites.map((invite) => (
                      <InviteRow
                        key={invite.id}
                        invite={invite}
                        canManage={canManage}
                        pending={saving}
                        onPermissionsChange={async (permissions) => {
                          setSaving(true);
                          setError(null);
                          try {
                            await auth.updateProjectGroupInvite(group.id, invite.id, {
                              role: roleFromPermissions(permissions),
                              permissions,
                            });
                            await load();
                          } catch (updateError) {
                            setError(updateError instanceof Error ? updateError.message : 'Не удалось обновить приглашение');
                            throw updateError;
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onRemove={async () => {
                          setSaving(true);
                          setError(null);
                          try {
                            await auth.removeProjectGroupInvite(group.id, invite.id);
                            await load();
                          } catch (removeError) {
                            setError(removeError instanceof Error ? removeError.message : 'Не удалось удалить приглашение');
                          } finally {
                            setSaving(false);
                          }
                        }}
                      />
                    )) : (
                      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                        Активных приглашений нет.
                      </div>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
