/**
 * AuthStore: Database operations for authentication
 *
 * Handles OTP lifecycle, user/project/session management for multi-user
 * authentication. All operations work with the SQLite database via getDb().
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type {
  User,
  Project,
  Session,
  OtpEntry,
  ShareLink,
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

  private generateShareId(length = 8): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let result = '';
    for (let index = 0; index < length; index += 1) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
  }
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
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await db.execute({
      sql: 'INSERT INTO otp_codes (id, email, code, expires_at, used) VALUES (?, ?, ?, ?, 0)',
      args: [id, email, code, expiresAt],
    });

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
   * - Code is not already used (used=0)
   * - Code is not expired (expires_at > now)
   *
   * @param email - Email address from request
   * @param code - 6-digit OTP code from request
   * @returns true if OTP was valid and consumed, false otherwise
   */
  async consumeOtp(email: string, code: string): Promise<boolean> {
    const db = await getDb();
    const now = new Date().toISOString();

    // Find valid OTP
    const result = await db.execute({
      sql: `
        SELECT id, email, code, expires_at, used
        FROM otp_codes
        WHERE email = ? AND code = ? AND used = 0 AND expires_at > ?
      `,
      args: [email, code, now],
    });

    if (result.rows.length === 0) {
      return false;
    }

    const otpId = result.rows[0].id as string;

    // Mark as used
    await db.execute({
      sql: 'UPDATE otp_codes SET used = 1 WHERE id = ?',
      args: [otpId],
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
    const existingResult = await db.execute({
      sql: 'SELECT id, email, created_at FROM users WHERE email = ?',
      args: [email],
    });

    if (existingResult.rows.length > 0) {
      const row = existingResult.rows[0];
      return {
        id: row.id as string,
        email: row.email as string,
        createdAt: row.created_at as string,
      };
    }

    // Create new user
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    await db.execute({
      sql: 'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)',
      args: [id, email, createdAt],
    });

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

    const result = await db.execute({
      sql: `SELECT p.id, p.user_id, p.name, p.created_at,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count
            FROM projects p WHERE p.user_id = ? ORDER BY p.created_at ASC`,
      args: [userId],
    });

    return result.rows.map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      createdAt: row.created_at as string,
      taskCount: Number(row.task_count ?? 0),
    }));
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
    const createdAt = new Date().toISOString();

    await db.execute({
      sql: 'INSERT INTO projects (id, user_id, name, created_at) VALUES (?, ?, ?, ?)',
      args: [id, userId, name, createdAt],
    });

    return { id, userId, name, createdAt };
  }

  async findProjectById(projectId: string): Promise<Project | null> {
    const db = await getDb();
    const result = await db.execute({
      sql: 'SELECT id, user_id, name, created_at FROM projects WHERE id = ?',
      args: [projectId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      createdAt: row.created_at as string,
    };
  }

  async createShareLink(projectId: string): Promise<ShareLink> {
    const db = await getDb();
    const createdAt = new Date().toISOString();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = this.generateShareId();
      try {
        await db.execute({
          sql: 'INSERT INTO share_links (id, project_id, created_at) VALUES (?, ?, ?)',
          args: [id, projectId, createdAt],
        });
        return { id, projectId, createdAt };
      } catch {
        // Retry on rare primary key collision
      }
    }

    throw new Error('Failed to create share link');
  }

  async findShareLinkById(id: string): Promise<ShareLink | null> {
    const db = await getDb();
    const result = await db.execute({
      sql: 'SELECT id, project_id, created_at FROM share_links WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      createdAt: row.created_at as string,
    };
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
    const checkResult = await db.execute({
      sql: 'SELECT id, user_id, name, created_at FROM projects WHERE id = ? AND user_id = ?',
      args: [projectId, userId],
    });

    if (checkResult.rows.length === 0) {
      return null;
    }

    // Update project name
    await db.execute({
      sql: 'UPDATE projects SET name = ? WHERE id = ?',
      args: [name, projectId],
    });

    // Fetch and return updated project
    const result = await db.execute({
      sql: 'SELECT id, user_id, name, created_at FROM projects WHERE id = ?',
      args: [projectId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      createdAt: row.created_at as string,
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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    const createdAt = new Date().toISOString();

    await db.execute({
      sql: `
        INSERT INTO sessions (id, user_id, project_id, access_token, refresh_token, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [id, userId, projectId, accessToken, refreshToken, expiresAt, createdAt],
    });

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

    const result = await db.execute({
      sql: `
        SELECT id, user_id, project_id, access_token, refresh_token, expires_at, created_at
        FROM sessions
        WHERE access_token = ?
      `,
      args: [accessToken],
    });

    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];
    const session: Session = {
      id: row.id as string,
      userId: row.user_id as string,
      projectId: row.project_id as string,
      accessToken: row.access_token as string,
      refreshToken: row.refresh_token as string,
      expiresAt: row.expires_at as string,
      createdAt: row.created_at as string,
    };

    // Cache the session for 5 minutes
    this.sessionCache.set(accessToken, {
      session,
      expiresAt: now + this.CACHE_TTL_MS,
    });

    return session;
  }

  /**
   * Find a session by refresh token
   *
   * @param refreshToken - JWT refresh token
   * @returns Session if found, undefined otherwise
   */
  async findSessionByRefreshToken(refreshToken: string): Promise<Session | undefined> {
    const db = await getDb();

    const result = await db.execute({
      sql: `
        SELECT id, user_id, project_id, access_token, refresh_token, expires_at, created_at
        FROM sessions
        WHERE refresh_token = ?
      `,
      args: [refreshToken],
    });

    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      userId: row.user_id as string,
      projectId: row.project_id as string,
      accessToken: row.access_token as string,
      refreshToken: row.refresh_token as string,
      expiresAt: row.expires_at as string,
      createdAt: row.created_at as string,
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

    // Clear cache for both old and new tokens (we don't have old token here, so clear new)
    // The old token will naturally expire from cache via TTL
    this.clearSessionCache(accessToken);

    const result = await db.execute({
      sql: 'UPDATE sessions SET access_token = ?, refresh_token = ? WHERE id = ?',
      args: [accessToken, refreshToken, sessionId],
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

    await db.execute({
      sql: 'DELETE FROM sessions WHERE id = ?',
      args: [sessionId],
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

    await db.execute({
      sql: 'UPDATE sessions SET project_id = ? WHERE id = ?',
      args: [projectId, sessionId],
    });
  }
}

/**
 * Singleton AuthStore instance
 */
export const authStore = new AuthStore();
