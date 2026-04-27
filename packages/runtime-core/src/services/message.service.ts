/**
 * MessageService provides message CRUD operations using Prisma Client.
 *
 * Handles AI dialog history with support for project-scoped and global messages.
 * All database operations use Prisma Client (no raw SQL).
 */

import { getPrisma } from '../prisma.js';
import type { Message } from '../types.js';
import { randomUUID } from 'node:crypto';

export class MessageService {
  private _prisma: ReturnType<typeof getPrisma> | undefined;

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }
    return this._prisma;
  }

  /**
   * Helper: Convert Prisma Message to domain Message
   */
  private messageToDomain(message: any): Message {
    return {
      id: message.id,
      projectId: message.projectId, // Required in Prisma schema
      role: message.role as Message['role'],
      content: message.content,
      requestContextId: message.requestContextId ?? null,
      historyGroupId: message.historyGroupId ?? null,
      deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /**
   * Add a message to the dialog history
   * @param role - Message role ('user' or 'assistant')
   * @param content - Message content
   * @param projectId - Project ID to associate the message with (required)
   * @returns The created message
   */
  async add(
    role: 'user' | 'assistant',
    content: string,
    projectId: string,
    options?: {
      requestContextId?: string;
      historyGroupId?: string;
    },
  ): Promise<Message> {
    const message = await this.prisma.message.create({
      data: {
        id: randomUUID(),
        projectId,
        role,
        content,
        requestContextId: options?.requestContextId,
        historyGroupId: options?.historyGroupId,
      },
    });

    return this.messageToDomain(message);
  }

  /**
   * Get all messages for a project, ordered by creation time
   * @param projectId - Project ID to filter messages by
   * @param limit - Maximum number of messages to return (default: 20, most recent)
   * @returns Array of messages ordered by creation time (oldest first)
   */
  async list(projectId: string, limit: number = 20): Promise<Message[]> {
    // Fetch last N messages ordered by creation time (most recent first)
    const messages = await this.prisma.message.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' }, // Changed to desc to get most recent first
      take: limit, // Take only the last N messages
    });

    // Reverse to maintain chronological order (oldest first)
    return messages.reverse().map(m => this.messageToDomain(m));
  }

  /**
   * Delete all messages for a project
   * @param projectId - Project ID to filter deletions by
   * @returns Number of messages deleted
   */
  async deleteAll(projectId: string): Promise<number> {
    const result = await this.prisma.message.deleteMany({
      where: { projectId },
    });

    return result.count;
  }

  async softDeleteConversationTail(projectId: string, historyGroupId: string): Promise<{
    deletedCount: number;
    deletedFromMessageId: string | null;
  }> {
    const anchorAssistantMessage = await this.prisma.message.findFirst({
      where: {
        projectId,
        historyGroupId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        requestContextId: true,
      },
    });

    if (!anchorAssistantMessage) {
      return {
        deletedCount: 0,
        deletedFromMessageId: null,
      };
    }

    let deletedFromMessageId = anchorAssistantMessage.id;
    let cutoffCreatedAt = anchorAssistantMessage.createdAt;

    if (anchorAssistantMessage.requestContextId) {
      const firstTurnMessage = await this.prisma.message.findFirst({
        where: {
          projectId,
          requestContextId: anchorAssistantMessage.requestContextId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          createdAt: true,
        },
      });

      if (firstTurnMessage) {
        deletedFromMessageId = firstTurnMessage.id;
        cutoffCreatedAt = firstTurnMessage.createdAt;
      }
    }

    const result = await this.prisma.message.updateMany({
      where: {
        projectId,
        deletedAt: null,
        createdAt: {
          gte: cutoffCreatedAt,
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      deletedCount: result.count,
      deletedFromMessageId,
    };
  }
}

/**
 * Singleton instance of MessageService for use throughout the application
 */
export const messageService = new MessageService();
