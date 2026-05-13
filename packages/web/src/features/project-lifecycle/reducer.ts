import type { PendingProjectCreation } from './model.ts';

export interface DeleteProjectDraft {
  id: string;
  name: string;
}

export interface ProjectLifecycleState {
  deleteProjectDraft: DeleteProjectDraft | null;
  pendingProjectCreation: PendingProjectCreation | null;
  showCreateProjectModal: boolean;
  startScreenPrefillPrompt: string | null;
}

type ProjectLifecycleAction =
  | { type: 'open_create_project_modal'; pending: PendingProjectCreation }
  | { type: 'close_create_project_modal' }
  | { type: 'resolve_project_limit_recovery'; pending: PendingProjectCreation }
  | { type: 'show_delete_project_modal'; draft: DeleteProjectDraft }
  | { type: 'hide_delete_project_modal' }
  | { type: 'project_created'; prompt: string | null }
  | { type: 'project_intent_prefilled'; prompt: string }
  | { type: 'set_start_screen_prefill_prompt'; prompt: string | null };

export const initialProjectLifecycleState: ProjectLifecycleState = {
  deleteProjectDraft: null,
  pendingProjectCreation: null,
  showCreateProjectModal: false,
  startScreenPrefillPrompt: null,
};

export function projectLifecycleReducer(
  state: ProjectLifecycleState,
  action: ProjectLifecycleAction,
): ProjectLifecycleState {
  switch (action.type) {
    case 'open_create_project_modal':
      return {
        ...state,
        pendingProjectCreation: action.pending,
        showCreateProjectModal: true,
      };
    case 'close_create_project_modal':
      return {
        ...state,
        pendingProjectCreation: null,
        showCreateProjectModal: false,
      };
    case 'resolve_project_limit_recovery':
      return {
        ...state,
        pendingProjectCreation: action.pending,
        showCreateProjectModal: true,
      };
    case 'show_delete_project_modal':
      return {
        ...state,
        deleteProjectDraft: action.draft,
      };
    case 'hide_delete_project_modal':
      return {
        ...state,
        deleteProjectDraft: null,
      };
    case 'project_created':
      return {
        ...state,
        pendingProjectCreation: null,
        showCreateProjectModal: false,
        startScreenPrefillPrompt: action.prompt,
      };
    case 'project_intent_prefilled':
      return {
        ...state,
        startScreenPrefillPrompt: action.prompt,
      };
    case 'set_start_screen_prefill_prompt':
      return {
        ...state,
        startScreenPrefillPrompt: action.prompt,
      };
    default:
      return state;
  }
}
