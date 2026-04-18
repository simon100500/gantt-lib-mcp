/**
 * Service barrel exports
 *
 * Exports all service singletons for import by packages/server and other consumers.
 * All services use Prisma Client for type-safe database operations.
 */

// TaskService read paths
export { taskService } from './task.service.js';
export { TaskService } from './task.service.js';

// ProjectService
export { projectService } from './project.service.js';
export { ProjectService } from './project.service.js';

// AuthService
export { authService } from './auth.service.js';
export { AuthService } from './auth.service.js';

// MessageService
export { messageService } from './message.service.js';
export { MessageService } from './message.service.js';

// DependencyService
export { dependencyService } from './dependency.service.js';
export { DependencyService } from './dependency.service.js';

// CommandService
export { commandService } from './command.service.js';
export { CommandService } from './command.service.js';
export { historyService } from './history.service.js';
export { HistoryService } from './history.service.js';
export { HistoryValidationError } from './history.service.js';
export { applyProjectCommandToSnapshot } from './project-command-apply.js';

// MCP mutation enforcement
export {
  enforcementService,
  createEnforcementService,
  createLimitReachedRejection,
} from './enforcement.service.js';

// Project schedule options / calendar payload helpers
export {
  SYSTEM_DEFAULT_CALENDAR_ID,
  SYSTEM_DEFAULT_CALENDAR_CODE,
  SYSTEM_DEFAULT_CALENDAR_NAME,
  buildProjectScheduleOptions,
  ensureSystemDefaultCalendar,
  loadEffectiveCalendarDays,
  loadCalendarCustomDays,
  getProjectCalendarSettings,
  getProjectScheduleOptionsForProject,
} from './projectScheduleOptions.js';

/**
 * Service exports summary:
 *
 * - taskService: Task read operations (list, get)
 * - projectService: Project CRUD operations (create, findById, listByUser, update, delete)
 * - authService: Auth operations (OTP, users, sessions, share links)
 * - messageService: Message CRUD operations (add, list, deleteAll)
 * - dependencyService: Dependency CRUD operations (createMany, deleteByTaskId, listByTaskId, validateDependencies)
 * - commandService: Command commit with atomic versioned persistence and event logging
 *
 * Usage in packages/server:
 * import { taskService, projectService, authService, messageService, commandService } from '@gantt/mcp/services';
 */
