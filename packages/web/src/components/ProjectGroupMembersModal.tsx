import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Shield, Trash2, UserPlus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../stores/useAuthStore.ts';
import type { ProjectGroup, ProjectGroupInvite, ProjectGroupMember, ProjectGroupMembersPayload, ProjectGroupMemberRole } from '../types.ts';

interface ProjectGroupMembersModalProps {
  group: ProjectGroup;
  onClose: () => void;
}

type EditableRole = Exclude<ProjectGroupMemberRole, 'owner'>;

function roleLabel(role: ProjectGroupMemberRole): string {
  if (role === 'owner') return 'Владелец';
  if (role === 'viewer') return 'Наблюдатель';
  return 'Редактор';
}

function InviteRoleSelect({
  value,
  disabled = false,
  onChange,
}: {
  value: EditableRole;
  disabled?: boolean;
  onChange: (role: EditableRole) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === 'viewer' ? 'viewer' : 'editor')}
      className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
    >
      <option value="editor">Редактор</option>
      <option value="viewer">Наблюдатель</option>
    </select>
  );
}

function MemberRow({
  member,
  canManage,
  pending,
  onRoleChange,
  onRemove,
}: {
  member: ProjectGroupMember;
  canManage: boolean;
  pending: boolean;
  onRoleChange: (role: EditableRole) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [role, setRole] = useState<EditableRole>(member.role);

  useEffect(() => {
    setRole(member.role);
  }, [member.role]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr),128px,40px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{member.email}</div>
        <div className="text-xs text-slate-500">Доступ с {new Date(member.createdAt).toLocaleDateString('ru-RU')}</div>
      </div>
      {canManage ? (
        <InviteRoleSelect
          value={role}
          disabled={pending}
          onChange={(nextRole) => {
            setRole(nextRole);
            void onRoleChange(nextRole).catch(() => {
              setRole(member.role);
            });
          }}
        />
      ) : (
        <div className="text-sm text-slate-600">{roleLabel(member.role)}</div>
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

function InviteRow({ invite }: { invite: ProjectGroupInvite }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr),128px] items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{invite.email}</div>
        <div className="text-xs text-slate-500">
          Приглашение активно до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}
        </div>
      </div>
      <div className="text-sm text-slate-600">{roleLabel(invite.role)}</div>
    </div>
  );
}

export function ProjectGroupMembersModal({ group, onClose }: ProjectGroupMembersModalProps) {
  const auth = useAuthStore();
  const [data, setData] = useState<ProjectGroupMembersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<EditableRole>('editor');
  const [error, setError] = useState<string | null>(null);

  const canManage = group.accessRole === 'owner';
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
      await auth.inviteProjectGroupMember(group.id, { email: normalizedEmail, role: inviteRole });
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
            {group.name}. Владельцы управляют доступом, редакторы могут менять проекты, наблюдатели работают только на просмотр.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {canManage ? (
            <form onSubmit={handleInvite} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <UserPlus className="h-4 w-4" />
                Пригласить коллегу
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr),140px,auto]">
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
                  <Label htmlFor="group-invite-role">Роль</Label>
                  <div id="group-invite-role">
                    <InviteRoleSelect value={inviteRole} disabled={saving} onChange={setInviteRole} />
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
                      <div key={row.key} className="grid grid-cols-[minmax(0,1fr),128px,40px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">{row.email}</div>
                          <div className="text-xs text-slate-500">Основной владелец пространства</div>
                        </div>
                        <div className="text-sm text-slate-600">{roleLabel(row.role)}</div>
                        <span className="h-9 w-9" />
                      </div>
                    ) : row.member ? (
                      <MemberRow
                        key={row.key}
                        member={row.member}
                        canManage={canManage}
                        pending={saving}
                        onRoleChange={async (role) => {
                          setSaving(true);
                          setError(null);
                          try {
                            await auth.updateProjectGroupMember(group.id, row.member!.userId, { role });
                            await load();
                          } catch (updateError) {
                            setError(updateError instanceof Error ? updateError.message : 'Не удалось обновить роль');
                            throw updateError;
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
                      <InviteRow key={invite.id} invite={invite} />
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
