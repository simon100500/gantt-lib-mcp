import { type FormEvent, useState } from 'react';

import type { ResourceScope, ResourceType } from '../../types.ts';
import { ResourceTypeIcon } from './ResourceTypeIcon.tsx';

export interface CreateResourceModalProps {
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: { name: string; type: ResourceType; scope: ResourceScope }) => void;
  onCancel: () => void;
}

const TYPE_OPTIONS: Array<{ value: ResourceType; label: string }> = [
  { value: 'human', label: 'Люди' },
  { value: 'equipment', label: 'Оборудование' },
  { value: 'material', label: 'Материалы' },
  { value: 'other', label: 'Другое' },
];

const SCOPE_OPTIONS: Array<{ value: ResourceScope; label: string; description: string }> = [
  { value: 'project', label: 'Проект', description: 'Доступен только в этом проекте' },
  { value: 'shared', label: 'Общий', description: 'Доступен проектам этой группы' },
];

export function CreateResourceModal({
  pending = false,
  error = null,
  onSubmit,
  onCancel,
}: CreateResourceModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ResourceType>('human');
  const [scope, setScope] = useState<ResourceScope>('project');

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !pending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: trimmedName, type, scope });
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      data-testid="create-resource-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onCancel();
        }
      }}
      role="dialog"
    >
      <form
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-[#dfe1e6] bg-white shadow-[0_24px_70px_rgba(9,30,66,0.22)]"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="border-b border-[#dfe1e6] px-4 py-3">
          <h2 className="text-[15px] font-bold text-[#172b4d]">Новый ресурс</h2>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase text-[#44546f]">Название</span>
            <input
              autoFocus
              className="h-9 rounded-md border border-[#dfe1e6] bg-white px-3 text-[13px] text-[#172b4d] outline-none transition-colors focus:border-primary placeholder:text-[#8993a4]"
              disabled={pending}
              placeholder="Введите название"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-[12px] font-bold uppercase text-[#44546f]">Тип</legend>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((option) => {
                const active = type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={active
                      ? 'inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/5 px-2.5 py-1.5 text-[12px] font-bold text-primary'
                      : 'inline-flex items-center gap-1.5 rounded-md border border-[#dfe1e6] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#44546f] transition-colors hover:border-primary hover:bg-primary/5'}
                    disabled={pending}
                    onClick={() => setType(option.value)}
                  >
                    <ResourceTypeIcon type={option.value} className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-[12px] font-bold uppercase text-[#44546f]">Область</legend>
            <div className="flex gap-2">
              {SCOPE_OPTIONS.map((option) => {
                const active = scope === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={active
                      ? 'flex-1 rounded-md border border-primary bg-primary/5 px-3 py-2 text-left'
                      : 'flex-1 rounded-md border border-[#dfe1e6] bg-white px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5'}
                    disabled={pending}
                    onClick={() => setScope(option.value)}
                  >
                    <div className={active ? 'text-[13px] font-bold text-primary' : 'text-[13px] font-medium text-[#172b4d]'}>
                      {option.label}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#6b778c]">
                      {option.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#dfe1e6] bg-[#f7f8fa] px-4 py-3">
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-md border border-[#dfe1e6] bg-white px-3 text-[12px] font-bold text-[#44546f] transition-colors hover:bg-[#f4f5f7]"
            disabled={pending}
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-[12px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit}
          >
            {pending ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  );
}
