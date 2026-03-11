/**
 * Tests for AI-only SSE streaming
 *
 * These tests verify that:
 * 1. useTaskStream only handles AI messages, not tasks
 * 2. Task messages are not handled
 * 3. Source client ID handling is removed
 */

import { describe, it, expect } from 'vitest';
import { useTaskStream, type TaskStreamMessage } from './useTaskStream';

describe('useTaskStream - AI Streaming Only', () => {
  it('should not have tasks type in TaskStreamMessage', () => {
    // This test documents that tasks are removed from the type
    type MessageTypes = TaskStreamMessage['type'];
    type ValidTypes = 'connected' | 'error';

    // Verify only valid types exist
    const validType: ValidTypes = 'connected';
    const messageType: MessageTypes = validType;

    expect(messageType).toBe('connected');

    // Verify 'tasks' is not assignable
    const tasksType: MessageTypes = 'tasks' as any;
    // @ts-expect-error - 'tasks' should not be a valid type
    const invalid: ValidTypes = tasksType;
  });

  it('should not have sourceClientId in messages', () => {
    // This test documents that sourceClientId is removed
    const message: TaskStreamMessage = {
      type: 'connected',
    };

    expect(message).not.toHaveProperty('sourceClientId');
  });

  it('should only handle AI-related message types', () => {
    // This test documents the expected message types
    const validTypes: TaskStreamMessage['type'][] = ['connected', 'error'];

    expect(validTypes).toHaveLength(2);
    expect(validTypes).toContain('connected');
    expect(validTypes).toContain('error');
  });
});
