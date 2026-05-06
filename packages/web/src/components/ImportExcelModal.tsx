import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, RefreshCw, Upload, X } from 'lucide-react';

import { Button } from './ui/button.tsx';

type ImportField =
  | 'wbsLevel'
  | 'name'
  | 'startDate'
  | 'endDate'
  | 'type'
  | 'progress'
  | 'workVolume'
  | 'workUnit'
  | 'completedVolume'
  | 'dependencies'
  | 'resources';

type ColumnConfig = {
  columnIndex: number | null;
  enabled: boolean;
};

type ImportMapping = Record<ImportField, ColumnConfig>;

type ImportIssue = {
  severity: 'error' | 'warning';
  rowNumber?: number;
  importIndex?: number;
  field?: ImportField;
  message: string;
};

type ImportPreviewResponse = {
  fileName: string;
  sheetName: string;
  columns: Array<{ index: number; header: string }>;
  mapping: ImportMapping;
  supportedFields: Array<{ field: ImportField; label: string; required: boolean }>;
  rows: Array<{
    rowNumber: number;
    importIndex: number;
    values: Partial<Record<ImportField, string>>;
    normalized: {
      name: string;
      wbsLevel: number;
      parentImportIndex: number | null;
      type: 'task' | 'milestone';
      resourceNames: string[];
      dependencyLabels: string[];
      isLeaf: boolean;
    };
  }>;
  issues: ImportIssue[];
  summary: {
    parsedRowCount: number;
    taskCount: number;
    dependencyCount: number;
    resourceNameCount: number;
  };
};

type ImportCommitResponse = {
  importedTaskCount: number;
  createdResourceCount: number;
  assignedTaskCount: number;
  newVersion: number;
};

type ImportErrorResponse = {
  error?: string;
  issues?: ImportIssue[];
};

interface ImportExcelModalProps {
  accessToken: string | null;
  refreshAccessToken: () => Promise<string | null>;
  onLoginRequired: () => void;
  onClose: () => void;
  onImported: (result: ImportCommitResponse) => void | Promise<void>;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function formatIssuePrefix(issue: ImportIssue): string {
  if (issue.importIndex) {
    return `Строка ${issue.importIndex}: `;
  }
  if (issue.rowNumber) {
    return `Excel строка ${issue.rowNumber}: `;
  }
  return '';
}

export function ImportExcelModal({
  accessToken,
  refreshAccessToken,
  onLoginRequired,
  onClose,
  onImported,
}: ImportExcelModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);

  const blockingIssues = useMemo(() => issues.filter((issue) => issue.severity === 'error'), [issues]);

  const invokeAuthorized = async <T,>(path: string, body: unknown): Promise<T> => {
    const headers = { 'Content-Type': 'application/json' };
    let token = accessToken;
    if (!token) {
      onLoginRequired();
      throw new Error('Unauthorized');
    }

    let response = await fetch(path, {
      method: 'POST',
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        onLoginRequired();
        throw new Error('Unauthorized');
      }
      token = refreshed;
      response = await fetch(path, {
        method: 'POST',
        headers: {
          ...headers,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ImportErrorResponse;
      const message = payload.error || `HTTP ${response.status}`;
      if (payload.issues) {
        setIssues(payload.issues);
      }
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  };

  const loadPreview = async (file: File, nextBase64: string, nextMapping?: ImportMapping | null) => {
    setPreviewLoading(true);
    setErrorMessage(null);
    try {
      const response = await invokeAuthorized<ImportPreviewResponse>('/api/import/excel/preview', {
        fileName: file.name,
        fileBase64: nextBase64,
        hierarchyMode: 'wbs_level',
        mapping: nextMapping ?? undefined,
      });

      setPreview(response);
      setMapping(response.mapping);
      setIssues(response.issues);
    } catch (error) {
      setPreview(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setSelectedFile(file);
    setPreview(null);
    setMapping(null);
    setIssues([]);
    setErrorMessage(null);

    try {
      const base64 = await fileToBase64(file);
      setFileBase64(base64);
      await loadPreview(file, base64, null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRefreshPreview = async () => {
    if (!selectedFile || !fileBase64) {
      return;
    }
    await loadPreview(selectedFile, fileBase64, mapping);
  };

  const handleCommit = async () => {
    if (!selectedFile || !fileBase64 || !mapping || blockingIssues.length > 0) {
      return;
    }

    setCommitLoading(true);
    setErrorMessage(null);
    try {
      const result = await invokeAuthorized<ImportCommitResponse>('/api/import/excel/commit', {
        fileName: selectedFile.name,
        fileBase64,
        hierarchyMode: 'wbs_level',
        mapping,
      });
      await onImported(result);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCommitLoading(false);
    }
  };

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !previewLoading && !commitLoading) {
        onClose();
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [commitLoading, onClose, previewLoading]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !previewLoading && !commitLoading) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Импорт из Excel</div>
            <div className="text-sm text-slate-500">Линейная структура по столбцу “Уровень WBS”, связи в формате “1ОН”, “2НН+12”.</div>
          </div>
          <button
            aria-label="Закрыть импорт"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            disabled={previewLoading || commitLoading}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-5 py-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-4">
            <div
              className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-slate-300 bg-slate-50'
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget === event.target) {
                  setDragActive(false);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void handleFile(file);
                }
              }}
            >
              <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                <Upload className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-slate-800">Перетащите `.xlsx` файл сюда</div>
              <div className="mt-1 text-xs text-slate-500">или выберите файл вручную</div>
              <Button
                className="mt-4"
                onClick={() => fileInputRef.current?.click()}
                type="button"
                variant="outline"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Выбрать файл
              </Button>
              <input
                accept=".xlsx"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleFile(file);
                  }
                }}
                ref={fileInputRef}
                type="file"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">Файл</div>
              <div className="mt-1 truncate text-sm font-medium text-slate-800">{selectedFile?.name ?? 'Файл не выбран'}</div>
              {preview?.sheetName ? (
                <div className="mt-1 text-xs text-slate-500">Лист: {preview.sheetName}</div>
              ) : null}
            </div>

            {mapping && preview ? (
              <div className="min-h-0 overflow-auto rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">Сопоставление столбцов</div>
                </div>
                <div className="space-y-3 p-4">
                  {preview.supportedFields.map((fieldConfig) => (
                    <div key={fieldConfig.field} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="text-sm font-medium text-slate-800">{fieldConfig.label}</label>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            checked={mapping[fieldConfig.field].enabled}
                            disabled={fieldConfig.required}
                            onChange={(event) => {
                              setMapping((prev) => (
                                prev
                                  ? {
                                      ...prev,
                                      [fieldConfig.field]: {
                                        ...prev[fieldConfig.field],
                                        enabled: event.target.checked,
                                      },
                                    }
                                  : prev
                              ));
                            }}
                            type="checkbox"
                          />
                          Импортировать
                        </label>
                      </div>
                      <select
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        onChange={(event) => {
                          const nextValue = event.target.value === '' ? null : Number(event.target.value);
                          setMapping((prev) => (
                            prev
                              ? {
                                  ...prev,
                                  [fieldConfig.field]: {
                                    ...prev[fieldConfig.field],
                                    columnIndex: nextValue,
                                  },
                                }
                              : prev
                          ));
                        }}
                        value={mapping[fieldConfig.field].columnIndex ?? ''}
                      >
                        <option value="">Не сопоставлено</option>
                        {preview.columns.map((column) => (
                          <option key={column.index} value={column.index}>
                            {column.header}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-sm text-slate-700">
                {preview
                  ? `Строк в файле: ${preview.summary.parsedRowCount} · К импорту: ${preview.summary.taskCount} · Связей: ${preview.summary.dependencyCount} · Ресурсов: ${preview.summary.resourceNameCount}`
                  : 'Загрузите файл, чтобы увидеть превью и ошибки.'}
              </div>
              <div className="flex items-center gap-2">
                <Button disabled={!selectedFile || !fileBase64 || previewLoading} onClick={() => void handleRefreshPreview()} type="button" variant="outline">
                  {previewLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Обновить превью
                </Button>
                <Button disabled={!preview || blockingIssues.length > 0 || commitLoading || previewLoading} onClick={() => void handleCommit()} type="button">
                  {commitLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Импортировать
                </Button>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-auto rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                  Ошибки и предупреждения
                </div>
                <div className="space-y-2 p-4">
                  {issues.length === 0 ? (
                    <div className="text-sm text-slate-500">Ошибок нет. Можно импортировать после проверки превью.</div>
                  ) : issues.map((issue, index) => (
                    <div
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        issue.severity === 'error'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                      key={`${issue.severity}-${issue.rowNumber ?? 'global'}-${index}`}
                    >
                      <span className="font-medium">{formatIssuePrefix(issue)}</span>
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-h-0 overflow-auto rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                  Превью импорта
                </div>
                {preview ? (
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr className="text-left text-slate-500">
                        <th className="px-4 py-3 font-medium">№</th>
                        <th className="px-4 py-3 font-medium">Уровень</th>
                        <th className="px-4 py-3 font-medium">Задача</th>
                        <th className="px-4 py-3 font-medium">Родитель</th>
                        <th className="px-4 py-3 font-medium">Связи</th>
                        <th className="px-4 py-3 font-medium">Ресурсы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 30).map((row) => (
                        <tr className="border-t border-slate-100 align-top" key={`${row.rowNumber}-${row.importIndex}`}>
                          <td className="px-4 py-3 text-slate-500">{row.importIndex}</td>
                          <td className="px-4 py-3 text-slate-700">{row.normalized.wbsLevel}</td>
                          <td className="px-4 py-3 text-slate-900">{row.normalized.name}</td>
                          <td className="px-4 py-3 text-slate-600">{row.normalized.parentImportIndex ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{row.normalized.dependencyLabels.join(', ') || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{row.normalized.resourceNames.join(', ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-6 text-sm text-slate-500">Превью появится после загрузки файла.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
