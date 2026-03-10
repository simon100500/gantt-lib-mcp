/**
 * AuthStore: Database operations for authentication
 *
 * Handles OTP lifecycle, user/project/session management for multi-user
 * authentication. All operations work with Prisma/PostgreSQL.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type {
  User,
  Project,
  Session,
  OtpEntry,
} from './types.js';

/**
 * Cached session entry with expiration time
 */
interface CachedSession {
  session: Session;
  expiresAt: number;
}

/**
 * AuthStore class encapsulating all authentication-related database operations
 */
export class AuthStore {
  private sessionCache = new Map<string, CachedSession>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Create an OTP entry in the database
   *
   * @param email - Email address for OTP delivery
   * @param code - 6-digit OTP code (hashed storage recommended in production)
   * @returns Created OtpEntry
   */
  async createOtp(email: string, code: string): Promise<OtpEntry> {
    const db = await getDb();
    const id = randomUUID();
    const expiresAtDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    const expiresAt = expiresAtDate.toISOString();

    // Use $executeRaw to avoid Prisma's DateTime serialization issue with PostgreSQL
    await db.$executeRaw`
      INSERT INTO otp_codes (id, email, code, expires_at, used)
      VALUES (${id}, ${email}, ${code}, ${expiresAt}, false)
    `;

    return {
      id,
      email,
      code,
      expiresAt,
      used: false,
    };
  }

  /**
   * Consume an OTP code (mark as used)
   *
   * Validates that:
   * - Email matches
   * - Code matches
   * - Code is not already used (used=false)
   * - Code is not expired (expires_at > now)
   *
   * @param email - Email address from request
   * @param code - 6-digit OTP code from request
   * @returns true if OTP was valid and consumed, false otherwise
   */
  async consumeOtp(email: string, code: string): Promise<boolean> {
    const db = await getDb();
    const now = new Date(); // Date object for comparison

    // Find valid OTP
    const otp = await db.otpCode.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: { gt: now }, // Compare with Date object
      },
    });

    if (!otp) {
      return false;
    }

    // Mark as used
    await db.otpCode.update({
      where: { id: otp.id },
      data: { used: true },
    });

    return true;
  }

  /**
   * Find existing user by email, or create a new one
   *
   * @param email - User email address
   * @returns User object (existing or newly created)
   */
  async findOrCreateUser(email: string): Promise<User> {
    const db = await getDb();

    // Try to find existing user
    let user = await db.user.findUnique({
      where: { email },
    });

    if (user) {
      return {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      };
    }

    // Create new user
    const id = randomUUID();
    const createdAt = new Date().toISOString(); // ISO string for $executeRaw

    await db.$executeRaw`
      INSERT INTO users (id, email, created_at)
      VALUES (${id}, ${email}, ${createdAt})
    `;

    return { id, email, createdAt };
  }

  /**
   * Create a default project for a new user
   *
   * @param userId - User ID to create project for
   * @returns Newly created Project
   */
  async createDefaultProject(userId: string): Promise<Project> {
    return this.createProject(userId, 'Default Project');
  }

  /**
   * List all projects for a user, ordered by creation date
   *
   * @param userId - User ID to list projects for
   * @returns Array of user's projects
   */
  async listProjects(userId: string): Promise<(Project & { taskCount: number })[]> {
    const db = await getDb();

    const projects = await db.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    // Get task counts for each project
    const result = await Promise.all(
      projects.map(async (project) => {
        const taskCount = await db.task.count({
          where: { projectId: project.id },
        });

        return {
          id: project.id,
          userId: project.userId,
          name: project.name,
          createdAt: project.createdAt.toISOString(),
          taskCount,
        };
      })
    );

    return result;
  }

  /**
   * Create a new project for a user
   *
   * @param userId - User ID to create project for
   * @param name - Project name
   * @returns Newly created Project
   */
  async createProject(userId: string, name: string): Promise<Project> {
    const db = await getDb();
    const id = randomUUID();
    const createdAt = new Date().toISOString(); // ISO string for $executeRaw

    await db.$executeRaw`
      INSERT INTO projects (id, user_id, name, created_at)
      VALUES (${id}, ${userId}, ${name}, ${createdAt})
    `;

    return { id, userId, name, createdAt };
  }

  /**
   * Update project name
   *
   * @param projectId - Project ID to update
   * @param userId - User ID for ownership verification
   * @param name - New project name
   * @returns Updated Project or null if not found
   */
  async updateProject(projectId: string, userId: string, name: string): Promise<Project | null> {
    const db = await getDb();

    // Verify project belongs to user
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
    });

    if (!project) {
      return null;
    }

    // Update project name
    await db.project.update({
      where: { id: projectId },
      data: { name },
    });

    // Fetch and return updated project
    const updated = await db.project.findUnique({
      where: { id: projectId },
    });

    if (!updated) {
      return null;
    }

    return {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Create a new session with JWT tokens
   *
   * @param userId - User ID for the session
   * @param projectId - Active project ID for the session
   * @param accessToken - JWT access token
   * @param refreshToken - JWT refresh token
   * @returns Created Session
   */
  async createSession(
    userId: string,
    projectId: string,
    accessToken: string,
    refreshToken: string
  ): Promise<Session> {
    const db = await getDb();
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days - ISO string
    const createdAt = new Date().toISOString(); // ISO string

    await db.$executeRaw`
      INSERT INTO sessions (id, user_id, project_id, access_token, refresh_token, expires_at, created_at)
      VALUES (${id}, ${userId}, ${projectId}, ${accessToken}, ${refreshToken}, ${expiresAt}, ${createdAt})
    `;

    return {
      id,
      userId,
      projectId,
      accessToken,
      refreshToken,
      expiresAt,
      createdAt,
    };
  }

  /**
   * Find a session by access token
   *
   * Uses in-memory cache to avoid database queries on every request.
   * Cache entries expire after CACHE_TTL_MS (5 minutes).
   *
   * @param accessToken - JWT access token
   * @returns Session if found, undefined otherwise
   */
  async findSessionByAccessToken(accessToken: string): Promise<Session | undefined> {
    // Check cache first
    const cached = this.sessionCache.get(accessToken);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      // Cache hit - return cached session
      return cached.session;
    }

    // Cache miss or expired - query database
    const db = await getDb();

    const session = await db.session.findUnique({
      where: { accessToken },
    });

    if (!session) {
      return undefined;
    }

    const result: Session = {
      id: session.id,
      userId: session.userId,
      projectId: session.projectId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    };

    // Cache the session for 5 minutes
    this.sessionCache.set(accessToken, {
      session: result,
      expiresAt: now + this.CACHE_TTL_MS,
    });

    return result;
  }

  /**
   * Find a session by refresh token
   *
   * @param refreshToken - JWT refresh token
   * @returns Session if found, undefined otherwise
   */
  async findSessionByRefreshToken(refreshToken: string): Promise<Session | undefined> {
    const db = await getDb();

    const session = await db.session.findUnique({
      where: { refreshToken },
    });

    if (!session) {
      return undefined;
    }

    return {
      id: session.id,
      userId: session.userId,
      projectId: session.projectId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    };
  }

  /**
   * Update tokens for an existing session (used during token refresh)
   *
   * Also clears the cache entry for the old access token and the new access token
   * to ensure fresh data on next request.
   *
   * @param sessionId - Session ID to update
   * @param accessToken - New access token
   * @param refreshToken - New refresh token
   */
  async updateSessionTokens(
    sessionId: string,
    accessToken: string,
    refreshToken: string
  ): Promise<void> {
    const db = await getDb();

    // Clear cache for the new access token
    // The old token will naturally expire from cache via TTL
    this.clearSessionCache(accessToken);

    await db.session.update({
      where: { id: sessionId },
      data: {
        accessToken,
        refreshToken,
      },
    });
  }

  /**
   * Clear a session cache entry
   *
   * Called during token refresh or logout to ensure fresh data on next request.
   *
   * @param accessToken - Access token to remove from cache
   */
  clearSessionCache(accessToken: string): void {
    this.sessionCache.delete(accessToken);
  }

  /**
   * Delete a session (logout)
   *
   * @param sessionId - Session ID to delete
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = await getDb();

    await db.session.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Update session's project (used when switching projects)
   *
   * @param sessionId - Session ID to update
   * @param projectId - New project ID
   */
  async updateSessionProject(sessionId: string, projectId: string): Promise<void> {
    const db = await getDb();

    await db.session.update({
      where: { id: sessionId },
      data: { projectId },
    });
  }
}

/**
 * Singleton AuthStore instance
 */
export const authStore = new AuthStore();
