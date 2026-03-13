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
  private prisma = getPrisma();

  /**
   * Helper: Convert Prisma Message to domain Message
   */
  private messageToDomain(message: any): Message {
    return {
      id: message.id,
      projectId: message.projectId, // Required in Prisma schema
      role: message.role as Message['role'],
      content: message.content,
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
  async add(role: 'user' | 'assistant', content: string, projectId: string): Promise<Message> {
    const message = await this.prisma.message.create({
      data: {
        id: randomUUID(),
        projectId,
        role,
        content,
      },
    });

    return this.messageToDomain(message);
  }

  /**
   * Get all messages for a project, ordered by creation time
   * @param projectId - Project ID to filter messages by
   * @returns Array of messages ordered by creation time (oldest first)
   */
  async list(projectId: string): Promise<Message[]> {
    const messages = await this.prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(m => this.messageToDomain(m));
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
}

/**
 * Singleton instance of MessageService for use throughout the application
 */
export const messageService = new MessageService();
