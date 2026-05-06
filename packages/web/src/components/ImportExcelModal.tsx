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
  onDownloadTemplate: () => void | Promise<void>;
  isDownloadTemplateLoading?: boolean;
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

function getFieldLabel(preview: ImportPreviewResponse, field: ImportField): string {
  return preview.supportedFields.find((entry) => entry.field === field)?.label ?? field;
}

export function ImportExcelModal({
  accessToken,
  refreshAccessToken,
  onLoginRequired,
  onClose,
  onImported,
  onDownloadTemplate,
  isDownloadTemplateLoading = false,
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
  const visibleIssues = issues.length > 0;

  const mappedFieldByColumnIndex = useMemo(() => {
    if (!mapping) {
      return new Map<number, ImportField>();
    }
    const next = new Map<number, ImportField>();
    (Object.keys(mapping) as ImportField[]).forEach((field) => {
      const config = mapping[field];
      if (config.enabled && config.columnIndex !== null) {
        next.set(config.columnIndex, field);
      }
    });
    return next;
  }, [mapping]);

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

  const emptyState = !selectedFile && !previewLoading && !preview;

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
      <div className={`flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] ${emptyState ? 'max-w-xl' : 'max-w-6xl'}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Импорт из Excel</div>
            {!emptyState ? (
              <div className="text-sm text-slate-500">Структура читается только из столбца “Уровень WBS”, связи только в формате “1ОН”, “2НН+12”.</div>
            ) : null}
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

        {emptyState ? (
          <div className="p-5">
            <div
              className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-slate-300 bg-slate-50'
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
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                <Upload className="h-6 w-6" />
              </div>
              <div className="text-base font-medium text-slate-800">Перетащите `.xlsx` файл сюда</div>
              <div className="mt-1 text-sm text-slate-500">или выберите его вручную</div>
              <Button className="mt-5" onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
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
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">Шаблон</div>
              <div className="mt-1 text-sm text-slate-600">Можно скачать пример файла с готовой таблицей Excel.</div>
              <Button
                className="mt-3"
                disabled={isDownloadTemplateLoading}
                onClick={() => void onDownloadTemplate()}
                type="button"
                variant="outline"
              >
                {isDownloadTemplateLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {isDownloadTemplateLoading ? 'Готовим шаблон...' : 'Скачать шаблон'}
              </Button>
            </div>
            {errorMessage ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 max-h-[92vh] flex-col gap-4 overflow-hidden px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">{selectedFile?.name ?? preview?.fileName ?? 'Файл'}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {preview
                    ? `Лист: ${preview.sheetName} · Строк: ${preview.summary.parsedRowCount} · К импорту: ${preview.summary.taskCount} · Связей: ${preview.summary.dependencyCount} · Ресурсов: ${preview.summary.resourceNameCount}`
                    : 'Разбираем файл...'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
                  <FileSpreadsheet className="h-4 w-4" />
                  Другой файл
                </Button>
                <Button disabled={!selectedFile || !fileBase64 || previewLoading} onClick={() => void handleRefreshPreview()} type="button" variant="outline">
                  {previewLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Обновить
                </Button>
                <Button disabled={!preview || blockingIssues.length > 0 || commitLoading || previewLoading} onClick={() => void handleCommit()} type="button">
                  {commitLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Импортировать
                </Button>
              </div>
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

            {errorMessage ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {visibleIssues ? (
              <div className="max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                  Ошибки и предупреждения
                </div>
                <div className="space-y-2 p-4">
                  {issues.map((issue, index) => (
                    <div
                      className={`rounded-lg border px-3 py-2 text-sm ${issue.severity === 'error'
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
            ) : null}

            <div className="min-h-0 overflow-auto rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                Превью и сопоставление столбцов
              </div>
              {preview && mapping ? (
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                    <tr className="align-top">
                      {preview.columns.map((column) => {
                        const mappedField = mappedFieldByColumnIndex.get(column.index) ?? null;
                        return (
                          <th className="min-w-[180px] border-r border-slate-100 px-3 py-3 text-left last:border-r-0" key={column.index}>
                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">{column.header}</div>
                              <select
                                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                                onChange={(event) => {
                                  const nextField = event.target.value as ImportField | '';
                                  setMapping((prev) => {
                                    if (!prev) {
                                      return prev;
                                    }

                                    const next = { ...prev };
                                    (Object.keys(next) as ImportField[]).forEach((field) => {
                                      if (next[field].columnIndex === column.index) {
                                        next[field] = {
                                          ...next[field],
                                          columnIndex: null,
                                          enabled: false,
                                        };
                                      }
                                      if (nextField && field === nextField && next[field].columnIndex !== column.index) {
                                        next[field] = {
                                          ...next[field],
                                          columnIndex: null,
                                          enabled: false,
                                        };
                                      }
                                    });

                                    if (nextField) {
                                      const current = next[nextField];
                                      next[nextField] = {
                                        ...current,
                                        columnIndex: column.index,
                                        enabled: true,
                                      };
                                    }

                                    return next;
                                  });
                                }}
                                value={mappedField ?? ''}
                              >
                                <option value="">Не импортировать</option>
                                {preview.supportedFields.map((fieldConfig) => (
                                  <option key={fieldConfig.field} value={fieldConfig.field}>
                                    {fieldConfig.label}
                                  </option>
                                ))}
                              </select>
                              {mappedField ? (
                                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                  <input
                                    checked={mapping[mappedField].enabled}
                                    disabled={preview.supportedFields.find((entry) => entry.field === mappedField)?.required}
                                    onChange={(event) => {
                                      setMapping((prev) => (
                                        prev
                                          ? {
                                            ...prev,
                                            [mappedField]: {
                                              ...prev[mappedField],
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
                              ) : (
                                <div className="text-xs text-slate-400">Столбец будет пропущен</div>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 30).map((row) => (
                      <tr className="border-t border-slate-100 align-top" key={`${row.rowNumber}-${row.importIndex}`}>
                        {preview.columns.map((column) => {
                          const mappedField = mappedFieldByColumnIndex.get(column.index) ?? null;
                          const value = mappedField ? row.values[mappedField] ?? '' : '';
                          return (
                            <td className="border-r border-slate-100 px-3 py-2.5 text-slate-700 last:border-r-0" key={`${row.rowNumber}-${column.index}`}>
                              {value || <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-6 text-sm text-slate-500">Превью появится после разбора файла.</div>
              )}
            </div>

            {preview && mapping ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                {(Object.keys(mapping) as ImportField[])
                  .filter((field) => mapping[field].enabled && mapping[field].columnIndex !== null)
                  .map((field) => getFieldLabel(preview, field))
                  .join(' · ')}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
