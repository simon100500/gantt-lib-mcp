import { useCallback, useRef, useState, type ChangeEvent } from 'react';

import type { BackupRestoreSummary } from '../../components/BackupRestoreModal.tsx';
import type { ProjectLoadResponse } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import { PLAN_LABELS, type PlanId } from '../../lib/billing.ts';
import type { ConstraintDenialPayload } from '../../lib/constraintUi.ts';
import { getExportAccessLevel } from '../../stores/useBillingStore.ts';
import { normalizeTasks } from '../../types.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import { buildProactiveConstraintDenial, type BillingConstraintStatus } from '../billing/policy.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';

type BackupImportResponse = {
  ok: true;
  summary: BackupRestoreSummary;
};

function isConstraintCode(code: string | undefined): code is ConstraintDenialPayload['code'] {
  return code === 'PROJECT_LIMIT_REACHED' || code === 'RESTORE_PROJECT_LIMIT_REACHED' || code === 'AI_LIMIT_REACHED' || code === 'SUBSCRIPTION_EXPIRED' || code === 'ARCHIVE_FEATURE_LOCKED' || code === 'EXPORT_FEATURE_LOCKED';
}

function formatPdfFileTimestamp(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}-${minutes}`;
}

function getAttachmentFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }

  return fallback;
}

async function triggerBlobDownload(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useExportImportController(params: {
  auth: {
    accessToken: string | null;
    isAuthenticated: boolean;
    refreshAccessToken: () => Promise<string | null>;
  };
  billingStatus: BillingConstraintStatus;
  currentProjectLabel: string;
  hasShareToken: boolean;
  isScheduleReadOnlyProject: boolean;
  onLoginRequired: () => void;
  openLimitModal: (denial: Partial<ConstraintDenialPayload> | null | undefined) => Promise<void>;
  refreshProjects: () => Promise<void>;
  doExportPdf: () => Promise<void>;
  isPdfHelperDismissed: () => boolean;
  excelExportMode?: 'gantt' | 'plan-fact';
}) {
  const {
    auth,
    billingStatus,
    currentProjectLabel,
    hasShareToken,
    isScheduleReadOnlyProject,
    onLoginRequired,
    openLimitModal,
    refreshProjects,
    doExportPdf,
    isPdfHelperDismissed,
    excelExportMode = 'gantt',
  } = params;

  // Export/import modal state and file selection workflow.
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const [isExportExcelLoading, setIsExportExcelLoading] = useState(false);
  const [isImportTemplateLoading, setIsImportTemplateLoading] = useState(false);
  const [showImportExcelModal, setShowImportExcelModal] = useState(false);
  const [showPdfHelper, setShowPdfHelper] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [backupRestorePending, setBackupRestorePending] = useState(false);
  const [backupRestoreError, setBackupRestoreError] = useState<string | null>(null);
  const [backupRestoreSummary, setBackupRestoreSummary] = useState<BackupRestoreSummary | null>(null);

  const reloadAuthenticatedProjectSnapshot = useCallback(async () => {
    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    let response = await fetch('/api/project', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      const refreshedToken = await auth.refreshAccessToken();
      if (!refreshedToken) {
        onLoginRequired();
        return;
      }
      token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
      response = await fetch('/api/project', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json() as ProjectLoadResponse;
    useProjectStore.getState().hydrateConfirmed(payload.version, {
      tasks: normalizeTasks(payload.snapshot.tasks as Task[]),
      dependencies: payload.snapshot.dependencies,
    }, {
      resources: payload.snapshot.resources,
      assignments: payload.snapshot.assignments,
      progressEntries: payload.snapshot.progressEntries ?? [],
    });
  }, [auth, onLoginRequired]);

  const handleExportPdf = useCallback(async () => {
    const proactiveExportDenial = buildProactiveConstraintDenial('export', billingStatus);
    if (proactiveExportDenial) {
      await openLimitModal(proactiveExportDenial);
      return;
    }

    if (isPdfHelperDismissed()) {
      await doExportPdf();
    } else {
      setShowPdfHelper(true);
    }
  }, [billingStatus, doExportPdf, isPdfHelperDismissed, openLimitModal]);

  const handleExportExcel = useCallback(async () => {
    const proactiveExportDenial = buildProactiveConstraintDenial('export', billingStatus);
    if (proactiveExportDenial) {
      await openLimitModal(proactiveExportDenial);
      return;
    }

    const exportAccessLevel = getExportAccessLevel(billingStatus);
    if (exportAccessLevel !== 'pdf_excel' && exportAccessLevel !== 'pdf_excel_api') {
      await openLimitModal({
        code: 'EXPORT_FEATURE_LOCKED',
        limitKey: 'export',
        reasonCode: 'feature_disabled',
        remaining: null,
        plan: ((billingStatus?.plan as PlanId | undefined) ?? 'free'),
        planLabel: billingStatus?.planMeta.label ?? PLAN_LABELS[((billingStatus?.plan as PlanId | undefined) ?? 'free')],
        upgradeHint: 'Экспорт PDF + Excel доступен на любом платном тарифе.',
      });
      return;
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    setIsExportExcelLoading(true);
    try {
      const exportUrl = excelExportMode === 'plan-fact' ? '/api/export/excel?mode=plan-fact' : '/api/export/excel';
      let response = await fetch(exportUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        const refreshedToken = await auth.refreshAccessToken();
        if (!refreshedToken) {
          onLoginRequired();
          return;
        }
        token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
        response = await fetch(exportUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      if (response.status === 403) {
        try {
          const body = await response.json() as Partial<ConstraintDenialPayload>;
          if (isConstraintCode(body.code)) {
            await openLimitModal(body);
            return;
          }
        } catch {
          // fall through to generic error
        }
        throw new Error('HTTP 403');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const projectName = currentProjectLabel?.trim() || 'Мой проект';
      const fallbackFileName = `ГетГант - ${projectName} - ${formatPdfFileTimestamp(new Date())}.xlsx`;
      const fileName = getAttachmentFileName(response.headers.get('Content-Disposition'), fallbackFileName);
      await triggerBlobDownload(blob, fileName);
    } finally {
      setIsExportExcelLoading(false);
    }
  }, [auth, billingStatus, currentProjectLabel, excelExportMode, onLoginRequired, openLimitModal]);

  const handleExportBackup = useCallback(async () => {
    const proactiveExportDenial = buildProactiveConstraintDenial('export', billingStatus);
    if (proactiveExportDenial) {
      await openLimitModal(proactiveExportDenial);
      return;
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    let response = await fetch('/api/export/backup', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      const refreshedToken = await auth.refreshAccessToken();
      if (!refreshedToken) {
        onLoginRequired();
        return;
      }
      token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
      response = await fetch('/api/export/backup', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    if (response.status === 403) {
      try {
        const body = await response.json() as Partial<ConstraintDenialPayload>;
        if (isConstraintCode(body.code)) {
          await openLimitModal(body);
          return;
        }
      } catch {
        // fall through to generic error
      }
      throw new Error('HTTP 403');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const projectName = currentProjectLabel?.trim() || 'Мой проект';
    const fallbackFileName = `ГетГант - ${projectName} - backup.gantt.json`;
    const fileName = getAttachmentFileName(response.headers.get('Content-Disposition'), fallbackFileName);
    await triggerBlobDownload(blob, fileName);
  }, [auth, billingStatus, currentProjectLabel, onLoginRequired, openLimitModal]);

  const handleOpenBackupImport = useCallback(() => {
    backupImportInputRef.current?.click();
  }, []);

  const handleBackupImportChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (hasShareToken) {
      return;
    }

    if (!auth.isAuthenticated) {
      onLoginRequired();
      return;
    }

    if (isScheduleReadOnlyProject) {
      return;
    }

    setSelectedBackupFile(file);
    setBackupRestoreError(null);
    setBackupRestoreSummary(null);
  }, [auth.isAuthenticated, hasShareToken, isScheduleReadOnlyProject, onLoginRequired]);

  const handleCloseBackupRestoreModal = useCallback(() => {
    if (backupRestorePending) {
      return;
    }
    setSelectedBackupFile(null);
    setBackupRestoreError(null);
    setBackupRestoreSummary(null);
  }, [backupRestorePending]);

  const handleConfirmBackupRestore = useCallback(async () => {
    if (!selectedBackupFile) {
      return;
    }

    let backup: unknown;
    try {
      backup = JSON.parse(await selectedBackupFile.text());
    } catch {
      setBackupRestoreError('Файл backup не является корректным JSON.');
      return;
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    setBackupRestorePending(true);
    setBackupRestoreError(null);
    try {
      let response = await fetch('/api/import/backup', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ backup }),
      });

      if (response.status === 401) {
        const refreshedToken = await auth.refreshAccessToken();
        if (!refreshedToken) {
          onLoginRequired();
          return;
        }
        token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
        response = await fetch('/api/import/backup', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ backup }),
        });
      }

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json() as { error?: string };
          if (payload.error) {
            message = payload.error;
          }
        } catch {
          // ignore invalid error body
        }
        setBackupRestoreError(`Не удалось восстановить backup: ${message}`);
        return;
      }

      const payload = await response.json() as BackupImportResponse;
      useProjectStore.getState().clearTransientState();
      await refreshProjects();
      await reloadAuthenticatedProjectSnapshot();
      setBackupRestoreSummary(payload.summary);
    } finally {
      setBackupRestorePending(false);
    }
  }, [auth, onLoginRequired, refreshProjects, reloadAuthenticatedProjectSnapshot, selectedBackupFile]);

  const handleDownloadImportTemplate = useCallback(async () => {
    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    setIsImportTemplateLoading(true);
    try {
      let response = await fetch('/api/import/excel/template', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        const refreshedToken = await auth.refreshAccessToken();
        if (!refreshedToken) {
          onLoginRequired();
          return;
        }
        token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
        response = await fetch('/api/import/excel/template', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const fileName = getAttachmentFileName(
        response.headers.get('Content-Disposition'),
        'Шаблон импорта задач - GetGantt.xlsx',
      );
      await triggerBlobDownload(blob, fileName);
    } finally {
      setIsImportTemplateLoading(false);
    }
  }, [auth, onLoginRequired]);

  const handleImportExcelCompleted = useCallback(async () => {
    await reloadAuthenticatedProjectSnapshot();
  }, [reloadAuthenticatedProjectSnapshot]);

  return {
    backupImportInputRef,
    isExportExcelLoading,
    isImportTemplateLoading,
    showImportExcelModal,
    showPdfHelper,
    selectedBackupFile,
    backupRestorePending,
    backupRestoreError,
    backupRestoreSummary,
    setShowImportExcelModal,
    setShowPdfHelper,
    handleExportPdf,
    handleExportExcel,
    handleExportBackup,
    handleOpenBackupImport,
    handleBackupImportChange,
    handleCloseBackupRestoreModal,
    handleConfirmBackupRestore,
    handleDownloadImportTemplate,
    handleImportExcelCompleted,
    reloadAuthenticatedProjectSnapshot,
  };
}
