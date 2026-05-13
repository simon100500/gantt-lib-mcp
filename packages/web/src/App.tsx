import { useCallback } from 'react';

import { AccountPage } from './components/AccountPage.tsx';
import { AdminPage } from './components/AdminPage.tsx';
import { EditProjectModal } from './components/EditProjectModal.tsx';
import { OtpModal } from './components/OtpModal.tsx';
import { PurchasePage } from './components/PurchasePage.tsx';
import { BlockPublicationIntentPage } from './components/PublicationIntentPages.tsx';
import { YandexCallbackPage } from './components/YandexCallbackPage.tsx';
import { useAuth } from './hooks/useAuth.ts';
import { useLocalTasks } from './hooks/useLocalTasks.ts';
import type { AuthSuccessResponse, ProjectLoadResponse } from './lib/apiTypes.ts';
import { useUIStore } from './stores/useUIStore.ts';
import { normalizePathname } from './app/appRoutes.ts';
import { useAppRouteController } from './app/useAppRouteController.ts';
import { WorkspaceShell } from './features/workspace/WorkspaceShell.tsx';

export default function App() {
  const auth = useAuth();
  const localTasks = useLocalTasks();
  const showOtpModal = useUIStore((state) => state.showOtpModal);
  const showEditProjectModal = useUIStore((state) => state.showEditProjectModal);
  const setShowOtpModal = useUIStore((state) => state.setShowOtpModal);
  const setShowEditProjectModal = useUIStore((state) => state.setShowEditProjectModal);
  const routeController = useAppRouteController({
    isAuthenticated: auth.isAuthenticated,
    onLoginRequired: () => setShowOtpModal(true),
  });

  // Route state and auth redirect orchestration.
  const handleAuthSuccess = useCallback(async (result: AuthSuccessResponse) => {
    auth.login(result, result.user, result.project);
    setShowOtpModal(false);

    const hasLocalEdits = localTasks.tasks.length > 0;
    if (hasLocalEdits) {
      try {
        let currentVersionResponse = await fetch('/api/project', {
          headers: {
            Authorization: `Bearer ${result.accessToken}`,
          },
        });

        if (!currentVersionResponse.ok) {
          throw new Error(`Failed to load project version: ${currentVersionResponse.status}`);
        }

        let currentVersion = (await currentVersionResponse.json() as ProjectLoadResponse).version;

        for (const task of localTasks.tasks) {
          const commitResponse = await fetch('/api/commands/commit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${result.accessToken}`,
            },
            body: JSON.stringify({
              clientRequestId: crypto.randomUUID(),
              baseVersion: currentVersion,
              command: {
                type: 'create_task',
                task: {
                  name: task.name,
                  startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
                  endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
                  type: task.type,
                  color: task.color,
                  parentId: task.parentId,
                  progress: task.progress,
                  dependencies: task.dependencies,
                },
              },
            }),
          });

          if (!commitResponse.ok) {
            throw new Error(`Failed to import local task: ${commitResponse.status}`);
          }

          const commitResult = await commitResponse.json() as { accepted: boolean; newVersion?: number; reason?: string };
          if (!commitResult.accepted || commitResult.newVersion === undefined) {
            throw new Error(`Failed to import local task: ${commitResult.reason ?? 'unknown error'}`);
          }

          currentVersion = commitResult.newVersion;
        }

        localStorage.removeItem('gantt_local_tasks');
        localStorage.removeItem('gantt_demo_mode');
      } catch (importError) {
        console.error('Failed to import local tasks after login:', importError);
      }
    }

    const defaultProjectName = 'Мой проект';
    if (localTasks.projectName && localTasks.projectName !== defaultProjectName) {
      try {
        await fetch(`/api/projects/${result.project.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${result.accessToken}`,
          },
          body: JSON.stringify({ name: localTasks.projectName }),
        });
        auth.login(result, result.user, { ...result.project, name: localTasks.projectName });
      } catch (transferError) {
        console.error('Failed to transfer project name after login:', transferError);
      }
    }

    const nextPath = routeController.resolveNextPath();
    if (nextPath) {
      routeController.navigate(nextPath);
      return;
    }

    if (normalizePathname(routeController.route.pathname) === '/login') {
      routeController.navigate('/');
    }
  }, [auth, localTasks, routeController, setShowOtpModal]);

  const handleOtpClose = useCallback(() => {
    setShowOtpModal(false);
    if (routeController.isLoginRoute) {
      routeController.navigate('/');
    }
  }, [routeController, setShowOtpModal]);

  const { initialPlan, initialPeriod, autoCheckout } = routeController.purchaseParams;

  return (
    <>
      {routeController.isYandexCallbackRoute ? (
        <YandexCallbackPage />
      ) : routeController.blockIntentPublicationId ? (
        <BlockPublicationIntentPage
          publicationId={routeController.blockIntentPublicationId}
          auth={auth}
          onLoginRequired={() => setShowOtpModal(true)}
        />
      ) : routeController.isPurchaseRoute ? (
        <PurchasePage
          initialPlan={initialPlan}
          initialPeriod={initialPeriod}
          autoCheckout={autoCheckout}
          isAuthenticated={auth.isAuthenticated}
          userEmail={auth.user?.email ?? null}
          onLoginRequired={() => setShowOtpModal(true)}
        />
      ) : routeController.isAccountRoute ? (
        <AccountPage
          isAuthenticated={auth.isAuthenticated}
          userEmail={auth.user?.email ?? null}
          onLoginRequired={() => setShowOtpModal(true)}
        />
      ) : routeController.isAdminRoute ? (
        <AdminPage
          isAuthenticated={auth.isAuthenticated}
          userEmail={auth.user?.email ?? null}
          onLoginRequired={() => setShowOtpModal(true)}
        />
      ) : (
        <WorkspaceShell
          auth={auth}
          localTasks={localTasks}
          onLoginRequired={() => setShowOtpModal(true)}
          templateCreateIntentId={routeController.templateCreateIntentId}
          onConsumeTemplateCreateIntent={routeController.consumeTemplateCreateIntent}
          projectCreationIntentId={routeController.projectCreationIntentId}
          onConsumeProjectCreationIntent={routeController.consumeProjectCreationIntent}
          projectOpenIntentId={routeController.projectOpenIntentId}
          onConsumeProjectOpenIntent={routeController.consumeProjectOpenIntent}
        />
      )}

      {showOtpModal && (
        <OtpModal
          initialMethod={routeController.authModalMethod}
          onSuccess={handleAuthSuccess}
          onClose={handleOtpClose}
        />
      )}

      {!routeController.isYandexCallbackRoute
        && !routeController.isPurchaseRoute
        && !routeController.isAccountRoute
        && !routeController.isAdminRoute
        && showEditProjectModal && (
          <EditProjectModal
            projectName={auth.isAuthenticated && auth.project ? auth.project.name : localTasks.projectName}
            onSave={async (name) => {
              if (!auth.isAuthenticated) {
                localTasks.setProjectName(name);
                return;
              }
              if (!auth.accessToken || !auth.project || !auth.user) {
                throw new Error('Not authenticated');
              }

              await auth.updateProject(auth.project.id, { name });
            }}
            onClose={() => setShowEditProjectModal(false)}
          />
        )}
    </>
  );
}
