/**
 * SQLite admin viewer routes
 * GET /admin/db — HTML interface
 * GET /admin/api/tables — list tables
 * GET /admin/api/table/:name — get table data
 */

import { getDb } from './db.js';

export async function registerAdminRoutes(fastify: any) {
  // Serve HTML viewer
  fastify.get('/admin/db', async (_req: any, reply: any) => {
    reply.type('text/html');
    return ADMIN_HTML;
  });

  // List all tables
  fastify.get('/admin/api/tables', async () => {
    const db = await getDb();
    const result = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type IN ('table','view')
      ORDER BY name
    `);
    return result.rows.map((r: any) => r.name);
  });

  // Get table structure and data
  fastify.get('/admin/api/table/:name', async (req: any) => {
    const tableName = req.params.name;
    const db = await getDb();

    // Get table schema
    const schema = await db.execute(`PRAGMA table_info('${tableName}')`);

    // Get row count
    const countResult = await db.execute(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const count = countResult.rows[0].count;

    // Get data (limit to 1000 rows)
    const data = await db.execute(`SELECT * FROM "${tableName}" LIMIT 1000`);

    return {
      table: tableName,
      columns: schema.rows.map((r: any) => ({
        name: r.name,
        type: r.type,
        pk: r.pk > 0,
      })),
      count,
      rows: data.rows,
    };
  });

  // Execute custom query (read-only)
  fastify.post('/admin/api/query', async (req: any) => {
    const { sql } = req.body as { sql?: string };
    if (!sql) return { error: 'sql required' };

    // Only allow SELECT
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) {
      return { error: 'Only SELECT queries allowed' };
    }

    try {
      const db = await getDb();
      const result = await db.execute(sql);
      return {
        columns: result.columns,
        rows: result.rows,
      };
    } catch (err: any) {
      return { error: err.message };
    }
  });
}

const ADMIN_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SQLite Admin</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    h1 { margin: 0 0 20px; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
    .nav { padding: 15px 20px; background: #2c3e50; display: flex; gap: 10px; flex-wrap: wrap; }
    .nav button { padding: 8px 16px; border: none; background: #34495e; color: white; border-radius: 4px; cursor: pointer; }
    .nav button:hover, .nav button.active { background: #3498db; }
    .query-box { padding: 20px; border-bottom: 1px solid #eee; }
    .query-box textarea { width: 100%; height: 60px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 13px; }
    .query-box button { margin-top: 10px; padding: 8px 20px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .query-box button:hover { background: #229954; }
    .table-info { padding: 15px 20px; background: #ecf0f1; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; }
    .table-info span { color: #7f8c8d; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 15px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #2c3e50; position: sticky; top: 0; }
    tr:hover { background: #f8f9fa; }
    .pk-badge { display: inline-block; padding: 2px 6px; background: #f39c12; color: white; font-size: 10px; border-radius: 3px; margin-left: 5px; }
    .error { padding: 15px 20px; background: #e74c3c; color: white; margin: 20px; border-radius: 4px; }
    .loading { padding: 40px; text-align: center; color: #7f8c8d; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <h1>🗄️ SQLite Admin</h1>
  <div class="container">
    <div class="nav" id="nav"></div>
    <div class="query-box">
      <textarea id="sqlInput" placeholder="SELECT * FROM tasks LIMIT 10">SELECT * FROM tasks LIMIT 10</textarea>
      <button onclick="runQuery()">▶ Run Query</button>
    </div>
    <div class="table-info" id="info"></div>
    <div id="content"></div>
  </div>

  <script>
    let currentTable = null;

    async function loadTables() {
      const res = await fetch('/admin/api/tables');
      const tables = await res.json();
      const nav = document.getElementById('nav');
      nav.innerHTML = tables.map(t =>
        \`<button onclick="loadTable('\${t}')" \${currentTable === t ? 'class="active"' : ''}>\${t}</button>\`
      ).join('');
    }

    async function loadTable(name) {
      currentTable = name;
      loadTables();
      document.getElementById('content').innerHTML = '<div class="loading">Loading...</div>';

      const res = await fetch(\`/admin/api/table/\${name}\`);
      const data = await res.json();

      document.getElementById('info').innerHTML = \`
        <strong>\${data.table}</strong>
        <span>\${data.count} rows</span>
      \`;

      if (data.rows.length === 0) {
        document.getElementById('content').innerHTML = '<div class="loading">Table is empty</div>';
        return;
      }

      document.getElementById('content').innerHTML = \`
        <table>
          <thead>
            <tr>\${data.columns.map(c => \`<th>\${c.name}\${c.pk ? '<span class="pk-badge">PK</span>' : ''}</th>\`).join('')}</tr>
          </thead>
          <tbody>
            \${data.rows.map(row => \`<tr>\${data.columns.map(c => \`<td><pre>\${formatValue(row[c.name])}</pre></td>\`).join('')}</tr>\`).join('')}
          </tbody>
        </table>
      \`;
    }

    async function runQuery() {
      const sql = document.getElementById('sqlInput').value;
      document.getElementById('content').innerHTML = '<div class="loading">Executing...</div>';
      document.getElementById('info').innerHTML = '';

      const res = await fetch('/admin/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });
      const data = await res.json();

      if (data.error) {
        document.getElementById('content').innerHTML = \`<div class="error">\${data.error}</div>\`;
        return;
      }

      if (!data.columns || data.columns.length === 0) {
        document.getElementById('content').innerHTML = '<div class="loading">No results</div>';
        return;
      }

      document.getElementById('info').innerHTML = \`<span>\${data.rows.length} rows</span>\`;
      document.getElementById('content').innerHTML = \`
        <table>
          <thead><tr>\${data.columns.map(c => \`<th>\${c}</th>\`).join('')}</tr></thead>
          <tbody>\${data.rows.map(row => \`<tr>\${data.columns.map(c => \`<td><pre>\${formatValue(row[c])}</pre></td>\`).join('')}</tr>\`).join('')}</tbody>
        </table>
      \`;
    }

    function formatValue(v) {
      if (v === null) return '<span style="color:#999">NULL</span>';
      if (v === undefined) return '';
      return String(v);
    }

    loadTables();
    loadTable('tasks');
  </script>
</body>
</html>`;
