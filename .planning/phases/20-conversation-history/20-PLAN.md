---
phase: 20-conversation-history
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/mcp/src/index.ts
  - packages/mcp/src/types.ts
autonomous: true
requirements:
  - HIST-01
  - HIST-02

must_haves:
  truths:
    - Agent can retrieve last N messages from conversation history via MCP tool
    - Agent can add assistant messages to conversation history via MCP tool
    - MessageService integration works correctly with Prisma
    - Messages are scoped to project ID for multi-user context
    - Limit parameter defaults to 20, max 50 for get_conversation_history
  artifacts:
    - path: packages/mcp/src/index.ts
      provides: MCP tool handlers for conversation history
      min_lines: 860
      exports: ["get_conversation_history", "add_message"]
    - path: packages/mcp/src/types.ts
      provides: Type definitions for conversation history tools
      min_lines: 279
      exports: ["GetConversationHistoryInput", "AddMessageInput"]
  key_links:
    - from: index.ts
      to: packages/mcp/src/services/message.service.ts
      via: import { messageService } from './services/message.service.js'
      pattern: messageService\\.(list|add)
    - from: index.ts
      to: packages/mcp/src/types.ts
      via: import type { GetConversationHistoryInput, AddMessageInput } from './types.js'
      pattern: GetConversationHistoryInput|AddMessageInput
    - from: message.service.ts
      to: @gantt/mcp/prisma
      via: import { getPrisma } from '../prisma.js'
      pattern: prisma\\.message\\.(findMany|create)
---

<objective>
Add MCP tools for conversation history access, enabling AI agents to read previous session context and record assistant responses to the project chat.

Purpose: Give agents context awareness of previous conversation turns and the ability to persist their responses, enabling multi-turn dialogues with proper history tracking.

Output: Two new MCP tools (`get_conversation_history`, `add_message`) integrated with MessageService, with proper input validation, project scoping, and limit handling.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/16-services-layer/16-03-SUMMARY.md
@packages/mcp/src/services/message.service.ts
@packages/mcp/src/index.ts
@packages/mcp/src/types.ts
@packages/mcp/prisma/schema.prisma

<interfaces>
From packages/mcp/src/services/message.service.ts (MessageService):
```typescript
export class MessageService {
  /**
   * Add a message to the dialog history
   * @param role - Message role ('user' or 'assistant')
   * @param content - Message content
   * @param projectId - Project ID to associate the message with (required)
   * @returns The created message
   */
  async add(role: 'user' | 'assistant', content: string, projectId: string): Promise<Message>;

  /**
   * Get all messages for a project, ordered by creation time
   * @param projectId - Project ID to filter messages by
   * @returns Array of messages ordered by creation time (oldest first)
   */
  async list(projectId: string): Promise<Message[]>;
}

export const messageService = new MessageService();
```

From packages/mcp/src/types.ts (Message type):
```typescript
export interface Message {
  id: string;
  projectId?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
```

From packages/mcp/src/index.ts (existing MCP tool pattern):
```typescript
// Tool registration in ListToolsRequestSchema handler:
{
  name: 'get_tasks',
  description: 'Get a list of Gantt chart tasks...',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Optional project ID to filter tasks by...',
      },
    },
  },
},

// Tool handling in CallToolRequestSchema handler:
if (name === 'get_tasks') {
  const { projectId: argProjectId } = args as { projectId?: string | null };
  const resolvedProjectId = argProjectId === null
    ? undefined
    : resolveProjectId(argProjectId);
  const tasks = await taskService.list(resolvedProjectId);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(tasks, null, 2),
      },
    ],
  };
}
```

From packages/mcp/prisma/schema.prisma (Message model):
```prisma
model Message {
  id        String      @id @default(uuid())
  projectId String      @map("project_id")
  role      MessageRole
  content   String
  createdAt DateTime    @default(now()) @map("created_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("messages")
  @@index([projectId])
}
```
</interfaces>

</context>

<tasks>

<task type="auto">
  <name>Task 1: Add type definitions for conversation history tools</name>
  <files>packages/mcp/src/types.ts</files>
  <action>
  Add to packages/mcp/src/types.ts after the Message interface (around line 187):

  ```typescript
  /**
   * Input type for get_conversation_history tool
   */
  export interface GetConversationHistoryInput {
    /** Optional project ID to filter messages by. If not provided, uses the current session project (PROJECT_ID env var) */
    projectId?: string;
    /** Number of recent messages to return (default: 20, max: 50) */
    limit?: number;
  }

  /**
   * Input type for add_message tool
   */
  export interface AddMessageInput {
    /** Message content (must be non-empty) */
    content: string;
    /** Optional project ID to associate the message with. If not provided, uses the current session project (PROJECT_ID env var) */
    projectId?: string;
  }
  ```

  These types define the input contracts for the two new MCP tools, following the existing pattern used for other tool inputs like CreateTaskInput.
  </action>
  <verify>
    <automated>grep -n "GetConversationHistoryInput\|AddMessageInput" packages/mcp/src/types.ts</automated>
  </verify>
  <done>
    - GetConversationHistoryInput interface defined with projectId and limit properties
    - AddMessageInput interface defined with content and projectId properties
    - Proper JSDoc comments for documentation
  </done>
</task>

<task type="auto">
  <name>Task 2: Register conversation history tools in MCP server</name>
  <files>packages/mcp/src/index.ts</files>
  <action>
  In packages/mcp/src/index.ts, add tool definitions to the ListToolsRequestSchema handler (after the create_tasks_batch tool, around line 337):

  ```typescript
  {
    name: 'get_conversation_history',
    description: 'Get recent messages from the conversation history for context awareness. Call this before responding to understand previous dialogue turns.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional project ID to filter messages by. If not provided, uses the current session project (PROJECT_ID env var)',
        },
        limit: {
          type: 'number',
          description: 'Number of recent messages to return (default: 20, max: 50)',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'add_message',
    description: 'Add an assistant message to the conversation history. Call this to record your response so future turns have context.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Message content to add to the conversation history',
        },
        projectId: {
          type: 'string',
          description: 'Optional project ID to associate the message with. If not provided, uses the current session project (PROJECT_ID env var)',
        },
      },
      required: ['content'],
    },
  },
  ```

  Also add the import at the top of the file (around line 8, with other imports):
  ```typescript
  import type { GetConversationHistoryInput, AddMessageInput } from './types.js';
  ```

  These tool registrations follow the existing pattern and provide clear descriptions for when the agent should use each tool.
  </action>
  <verify>
    <automated>grep -n "get_conversation_history\|add_message" packages/mcp/src/index.ts | head -4</automated>
  </verify>
  <done>
    - get_conversation_history tool registered with proper input schema
    - add_message tool registered with proper input schema
    - Descriptions clearly indicate when to use each tool
    - Import statements added for type definitions
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement get_conversation_history tool handler</name>
  <files>packages/mcp/src/index.ts</files>
  <action>
  Add the messageService import at the top of packages/mcp/src/index.ts (around line 9, with other service imports):
  ```typescript
  import { messageService } from './services/message.service.js';
  ```

  Then in the CallToolRequestSchema handler (after the create_tasks_batch handler, around line 840), add:

  ```typescript
  // get_conversation_history tool
  if (name === 'get_conversation_history') {
    const { projectId: argProjectId, limit } = args as GetConversationHistoryInput & { limit?: number };
    const resolvedProjectId = resolveProjectId(argProjectId);

    // Validate and clamp limit parameter
    const defaultLimit = 20;
    const maxLimit = 50;
    const messageLimit = Math.min(Math.max(limit ?? defaultLimit, 1), maxLimit);

    // Fetch all messages for the project
    const allMessages = await messageService.list(resolvedProjectId);

    // Return the last N messages (most recent first)
    const recentMessages = allMessages.slice(-messageLimit).reverse();

    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      totalMessages: allMessages.length,
      returnedMessages: recentMessages.length,
      limit: messageLimit,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            messages: recentMessages,
            total: allMessages.length,
            returned: recentMessages.length,
            limit: messageLimit,
          }, null, 2),
        },
      ],
    };
  }
  ```

  This handler:
  - Resolves projectId using the existing resolveProjectId helper pattern
  - Validates and clamps the limit parameter (default 20, max 50)
  - Fetches all messages via MessageService.list()
  - Returns the last N messages in reverse order (most recent first)
  - Logs debug information for troubleshooting
  </action>
  <verify>
    <automated>grep -A 20 "get_conversation_history tool" packages/mcp/src/index.ts | grep -c "messageService\|resolveProjectId"</automated>
  </verify>
  <done>
    - get_conversation_history handler implemented with proper projectId resolution
    - Limit parameter validated and clamped (1-50, default 20)
    - Messages returned in reverse chronological order (most recent first)
    - Debug logging added for observability
    - Response includes metadata (total, returned, limit)
  </done>
</task>

<task type="auto">
  <name>Task 4: Implement add_message tool handler</name>
  <files>packages/mcp/src/index.ts</files>
  <action>
  In the CallToolRequestSchema handler (after the get_conversation_history handler), add:

  ```typescript
  // add_message tool
  if (name === 'add_message') {
    const input = args as unknown as AddMessageInput;
    const { projectId: argProjectId } = args as { projectId?: string };
    const resolvedProjectId = resolveProjectId(argProjectId);

    // Validate content
    if (!input.content || input.content.trim().length === 0) {
      throw new Error('content is required and must be non-empty');
    }

    // Add the message (always as 'assistant' role)
    const message = await messageService.add('assistant', input.content.trim(), resolvedProjectId);

    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      messageId: message.id,
      contentLength: message.content.length,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message,
            success: true,
          }, null, 2),
        },
      ],
    };
  }
  ```

  This handler:
  - Resolves projectId using the existing resolveProjectId helper pattern
  - Validates that content is non-empty
  - Adds message with 'assistant' role via MessageService.add()
  - Returns the created message for confirmation
  - Logs debug information for troubleshooting
  </action>
  <verify>
    <automated>grep -A 15 "add_message tool" packages/mcp/src/index.ts | grep -c "messageService\.add"</automated>
  </verify>
  <done>
    - add_message handler implemented with proper projectId resolution
    - Content validation ensures non-empty messages
    - Messages added with 'assistant' role
    - Returns created message for confirmation
    - Debug logging added for observability
  </done>
</task>

</tasks>

<verification>
## Overall Verification Steps

1. **Type safety check:**
   ```bash
   cd packages/mcp && npx tsc --noEmit
   ```
   Should complete without type errors.

2. **Tool registration check:**
   ```bash
   grep -E "name: '(get_conversation_history|add_message)'" packages/mcp/src/index.ts
   ```
   Should show both tool names registered.

3. **Handler implementation check:**
   ```bash
   grep -c "get_conversation_history tool\|add_message tool" packages/mcp/src/index.ts
   ```
   Should be 4 (2 tool definitions + 2 handler comments).

4. **MessageService integration check:**
   ```bash
   grep -c "messageService\." packages/mcp/src/index.ts
   ```
   Should be 2 (one for list, one for add).

5. **Type definitions check:**
   ```bash
   grep -E "GetConversationHistoryInput|AddMessageInput" packages/mcp/src/types.ts
   ```
   Should show both interfaces defined.
</verification>

<success_criteria>
- [ ] get_conversation_history tool returns last N messages (default: 20, max: 50)
- [ ] add_message tool records assistant messages to project chat
- [ ] MessageService integration works correctly (list and add operations)
- [ ] Agent can read and write conversation history
- [ ] Project ID resolution follows existing pattern (PROJECT_ID env var)
- [ ] TypeScript compilation succeeds
- [ ] Debug logging added for observability
</success_criteria>

<output>
After completion, create `.planning/phases/20-conversation-history/20-01-SUMMARY.md` with:
- Duration metrics
- Files created/modified
- Deviations from plan
- Key implementation details
- Success criteria verification
</output>
