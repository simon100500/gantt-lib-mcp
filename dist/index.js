import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
// Create MCP server instance
const server = new Server({
    name: 'gantt-lib-mcp-server',
    version: '0.1.0',
}, {
    capabilities: {
        tools: {},
    },
});
// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'ping',
            description: 'A simple ping tool to test MCP server connectivity',
            inputSchema: {
                type: 'object',
                properties: {},
            },
        },
    ],
}));
// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'ping') {
        return {
            content: [
                {
                    type: 'text',
                    text: 'pong',
                },
            ],
        };
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
});
// Start server with stdio transport
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Server runs via stdio, no explicit listen needed
    // Process will stay alive as long as stdio is open
}
main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map