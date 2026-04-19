import { useState } from 'react';
import { useAuthStore } from '../stores/useAuthStore';

export function AccountProjectsPage() {
  const project = useAuthStore((state) => state.project);
  const projects = useAuthStore((state) => state.projects);
  const switchProject = useAuthStore((state) => state.switchProject);
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedProjects = [...projects].sort((left, right) => {
    if (left.id === project?.id) return -1;
    if (right.id === project?.id) return 1;
    if (left.status === 'active' && right.status !== 'active') return -1;
    if (left.status !== 'active' && right.status === 'active') return 1;
    return left.name.localeCompare(right.name, 'ru');
  });

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <a
          href="/"
          className="inline-flex items-center gap-1 rounded text-sm text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
        >
          ← Назад к приложению
        </a>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Проекты</h1>
              <p className="mt-1 text-sm text-slate-500">
                Активный проект открывается первым. Отсюда можно быстро переключиться в другой.
              </p>
            </div>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              Открыть приложение
            </a>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {sortedProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-400">
                Проектов пока нет.
              </div>
            ) : sortedProjects.map((item) => {
              const isCurrent = item.id === project?.id;
              const statusLabel = item.status === 'archived' ? 'Архив' : 'Активный';
              const statusClassName = item.status === 'archived'
                ? 'bg-slate-100 text-slate-600'
                : 'bg-green-100 text-green-700';

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 ${isCurrent ? 'border-primary bg-primary/[0.04]' : 'border-slate-200 bg-slate-50'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium text-slate-900">{item.name}</div>
                        {isCurrent && (
                          <span className="rounded-full bg-primary/[0.1] px-2 py-0.5 text-xs font-medium text-primary">
                            Текущий
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClassName}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {typeof item.taskCount === 'number' ? `${item.taskCount} задач` : 'Количество задач обновится после загрузки проекта'}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href="/"
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-white"
                      >
                        Открыть
                      </a>
                      {!isCurrent && (
                        <button
                          type="button"
                          disabled={switchingProjectId === item.id}
                          onClick={() => {
                            setSwitchingProjectId(item.id);
                            setError(null);
                            void switchProject(item.id)
                              .then(() => {
                                window.location.href = '/';
                              })
                              .catch((switchError) => {
                                setError(switchError instanceof Error ? switchError.message : 'Не удалось переключить проект');
                              })
                              .finally(() => {
                                setSwitchingProjectId((current) => (current === item.id ? null : current));
                              });
                          }}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {switchingProjectId === item.id ? 'Переключение…' : 'Сделать текущим'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
