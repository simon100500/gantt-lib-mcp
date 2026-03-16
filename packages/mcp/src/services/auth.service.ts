/**
 * AuthService: Authentication operations using Prisma
 *
 * Provides type-safe authentication and session management with Prisma Client.
 * Replaces auth-store.ts direct SQL queries with type-safe Prisma operations.
 * Preserves session caching behavior (5-minute TTL).
 */

import { getPrisma } from '../prisma.js';
import type { User, Project, Session, OtpEntry, ShareLink } from '../types.js';
import { projectService } from './project.service.js';
import { randomUUID } from 'node:crypto';

/**
 * Session cache entry with expiration
 */
interface CachedSession {
  session: Session;
  expiresAt: number;
}

export class AuthService {
  private prisma = getPrisma();
  private sessionCache = new Map<string, CachedSession>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate share link ID
   * Uses safe alphabet (no I, l, O, 0) to avoid confusion
   *
   * @param length - Length of ID to generate (default: 8)
   * @returns Random share link ID
   */
  private generateShareId(length = 8): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
  }

  /**
   * Convert Prisma User to domain User
   * Handles DateTime → string conversion for createdAt
   */
  private userToDomain(user: any): User {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * Convert Prisma Session to domain Session
   * Handles DateTime → string conversion for all timestamp fields
   */
  private sessionToDomain(session: any): Session {
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
   * Create an OTP entry
   *
   * @param email - Email address for OTP delivery
   * @param code - 6-digit OTP code
   * @returns Created OtpEntry
   */
  async createOtp(email: string, code: string): Promise<OtpEntry> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const otp = await this.prisma.otpCode.create({
      data: {
        email,
        code,
        expiresAt,
      },
    });

    return {
      id: otp.id,
      email: otp.email,
      code: otp.code,
      expiresAt: otp.expiresAt.toISOString(),
      used: otp.used,
    };
  }

  /**
   * Consume an OTP code
   *
   * Validates that:
   * - Email matches
   * - Code matches
   * - Code is not already used
   * - Code is not expired
   *
   * @param email - Email address from request
   * @param code - 6-digit OTP code from request
   * @returns true if OTP was valid and consumed, false otherwise
   */
  async consumeOtp(email: string, code: string): Promise<boolean> {
    const now = new Date();

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: { gt: now },
      },
    });

    if (!otp) {
      return false;
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { used: true },
    });

    return true;
  }

  /**
   * Find existing user by email, or create a new one
   *
   * Uses upsert for idempotent operation.
   *
   * @param email - User email address
   * @returns User object (existing or newly created)
   */
  async findOrCreateUser(email: string): Promise<User> {
    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });

    return this.userToDomain(user);
  }

  async findUserById(userId: string): Promise<User | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return undefined;
    return this.userToDomain(user);
  }

  /**
   * List all projects for a user with task counts
   *
   * Delegates to ProjectService.
   *
   * @param userId - User ID to list projects for
   * @returns Array of projects with task counts
   */
  async listProjects(userId: string): Promise<Array<Project & { taskCount: number }>> {
    return projectService.listByUser(userId);
  }

  /**
   * Create a new project
   *
   * Delegates to ProjectService.
   *
   * @param userId - User ID to create project for
   * @param name - Project name
   * @returns Newly created Project
   */
  async createProject(userId: string, name: string): Promise<Project> {
    return projectService.create(userId, name);
  }

  /**
   * Create default project for a new user
   *
   * Delegates to ProjectService.
   *
   * @param userId - User ID to create default project for
   * @returns Newly created default Project
   */
  async createDefaultProject(userId: string): Promise<Project> {
    return projectService.createDefaultProject(userId);
  }

  /**
   * Find project by ID
   *
   * Delegates to ProjectService.
   *
   * @param projectId - Project ID to find
   * @returns Project if found, null otherwise
   */
  async findProjectById(projectId: string): Promise<Project | null> {
    return projectService.findById(projectId);
  }

  /**
   * Update project name
   *
   * Delegates to ProjectService.
   *
   * @param projectId - Project ID to update
   * @param userId - User ID for ownership verification
   * @param name - New project name
   * @returns Updated Project if found, null otherwise
   */
  async updateProject(projectId: string, userId: string, name: string): Promise<Project | null> {
    return projectService.update(projectId, userId, name);
  }

  /**
   * Create a session with JWT tokens
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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await this.prisma.session.create({
      data: {
        userId,
        projectId,
        accessToken,
        refreshToken,
        expiresAt,
      },
    });

    return this.sessionToDomain(session);
  }

  /**
   * Find session by access token
   *
   * Uses in-memory cache with 5-minute TTL to avoid database queries.
   *
   * @param accessToken - JWT access token
   * @returns Session if found, undefined otherwise
   */
  async findSessionByAccessToken(accessToken: string): Promise<Session | undefined> {
    // Check cache first
    const cached = this.sessionCache.get(accessToken);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.session;
    }

    // Cache miss or expired - query database
    const session = await this.prisma.session.findUnique({
      where: { accessToken },
    });

    if (!session) {
      return undefined;
    }

    const domainSession = this.sessionToDomain(session);

    // Cache for 5 minutes
    this.sessionCache.set(accessToken, {
      session: domainSession,
      expiresAt: now + this.CACHE_TTL_MS,
    });

    return domainSession;
  }

  /**
   * Find session by refresh token
   *
   * @param refreshToken - JWT refresh token
   * @returns Session if found, undefined otherwise
   */
  async findSessionByRefreshToken(refreshToken: string): Promise<Session | undefined> {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
    });

    if (!session) {
      return undefined;
    }

    return this.sessionToDomain(session);
  }

  /**
   * Update session tokens
   *
   * Called during token refresh.
   * Clears cache entry for new access token.
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
    // Clear cache for new token
    this.clearSessionCache(accessToken);

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  /**
   * Clear session cache entry
   *
   * Called during token refresh or logout to ensure fresh data.
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
    await this.prisma.session.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Update session's project
   *
   * Called when switching projects.
   *
   * @param sessionId - Session ID to update
   * @param projectId - New project ID
   */
  async updateSessionProject(sessionId: string, projectId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { projectId },
    });
  }

  /**
   * Create a share link for a project
   *
   * Retries on collision (unlikely with 8-char random ID).
   *
   * @param projectId - Project ID to create share link for
   * @returns Created ShareLink
   */
  async createShareLink(projectId: string): Promise<ShareLink> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = this.generateShareId();
      try {
        const link = await this.prisma.shareLink.create({
          data: {
            id,
            projectId,
          },
        });

        return {
          id: link.id,
          projectId: link.projectId,
          createdAt: link.createdAt.toISOString(),
        };
      } catch {
        // Retry on primary key collision
      }
    }

    throw new Error('Failed to create share link');
  }

  /**
   * Find share link by ID
   *
   * @param id - Share link ID to find
   * @returns ShareLink if found, null otherwise
   */
  async findShareLinkById(id: string): Promise<ShareLink | null> {
    const link = await this.prisma.shareLink.findUnique({
      where: { id },
    });

    if (!link) {
      return null;
    }

    return {
      id: link.id,
      projectId: link.projectId,
      createdAt: link.createdAt.toISOString(),
    };
  }
}

/**
 * Singleton AuthService instance
 */
export const authService = new AuthService();
