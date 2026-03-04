/**
 * Re-export getDb from @gantt/mcp so the server uses the same DB singleton.
 * Both the server and the MCP child process share the same SQLite file via DB_PATH.
 */
export { getDb } from '@gantt/mcp/db';
