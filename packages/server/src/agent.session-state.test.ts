import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRouteContextSummary,
  buildSessionOpenThreadState,
  buildSessionStateFromTranscript,
} from './agent/session-state.js';
import { compactSessionContext } from './agent/pi-agent-runner.js';

describe('persistent session state helpers', () => {
  it('keeps unresolved clarification markers for short follow-up turns', () => {
    const openThreads = buildSessionOpenThreadState({
      userMessage: 'во всех',
      assistantResponse: 'Уточни, в каких секциях это нужно сделать?',
      priorOpenThreads: {
        unresolved: true,
        activeOperationKind: 'create',
        recentAssistantQuestion: 'Куда именно добавить эти работы?',
        lastUserMessage: 'добавь работы по отделке',
        lastAssistantMessage: 'Куда именно добавить эти работы?',
        targetEntityHints: ['отделка'],
      },
      mutationAccepted: false,
    });

    assert.equal(openThreads?.unresolved, true);
    assert.equal(openThreads?.activeOperationKind, 'create');
    assert.match(openThreads?.recentAssistantQuestion ?? '', /Уточни/);
  });

  it('builds session-aware routing summary from snapshot and transcript tail', () => {
    const summary = buildRouteContextSummary({
      sessionState: {
        id: 'state-1',
        projectId: 'project-1',
        sessionKey: 'project-chat',
        messagesSnapshot: [],
        rollingSummary: 'Latest user intent: добавить работы по отделке',
        openThreads: {
          unresolved: true,
          activeOperationKind: 'create',
          recentAssistantQuestion: 'В каких секциях это сделать?',
          lastUserMessage: 'добавь отделку',
          lastAssistantMessage: 'В каких секциях это сделать?',
          targetEntityHints: ['секции'],
        },
        lastRequestContextId: 'run-1',
        compactionVersion: 1,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      recentMessages: [
        {
          id: 'm1',
          projectId: 'project-1',
          role: 'user',
          content: 'во всех',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    assert.match(summary, /Open thread:/);
    assert.match(summary, /во всех/);
  });

  it('rebuilds compact session state from transcript tail', () => {
    const rebuilt = buildSessionStateFromTranscript({
      projectId: 'project-1',
      recentMessages: [
        {
          id: 'm1',
          projectId: 'project-1',
          role: 'user',
          content: 'добавь работы по отделке',
          createdAt: new Date('2026-05-09T10:00:00.000Z').toISOString(),
        },
        {
          id: 'm2',
          projectId: 'project-1',
          role: 'assistant',
          content: 'В каких секциях это сделать?',
          createdAt: new Date('2026-05-09T10:00:05.000Z').toISOString(),
        },
      ],
      userMessage: 'добавь работы по отделке',
      assistantResponse: 'В каких секциях это сделать?',
      mutationAccepted: false,
    });

    assert.equal(rebuilt.messagesSnapshot.length, 2);
    assert.equal(rebuilt.openThreads?.unresolved, true);
    assert.match(rebuilt.rollingSummary ?? '', /Open thread:/);
  });

  it('bounds context growth while preserving session memory header', async () => {
    const compacted = await compactSessionContext([
      { role: 'assistant', content: '[SESSION_MEMORY]\nrollingSummary: keep me' },
      ...Array.from({ length: 40 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `message-${index}`,
      })),
    ]);

    assert.equal(compacted[0]?.content, '[SESSION_MEMORY]\nrollingSummary: keep me');
    assert.ok(compacted.length <= 32);
  });
});
