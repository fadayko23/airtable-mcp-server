import type {VercelRequest, VercelResponse} from '@vercel/node';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';

// Minimal SSE MCP endpoint for OpenAI Connector
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET for SSE handshake
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').send('Method Not Allowed');
    return;
  }

  try {
    // Import compiled classes after the build step
    const {AirtableService} = await import('../dist/airtableService.js');
    const {AirtableMCPServer} = await import('../dist/mcpServer.js');
    const airtableService = new AirtableService();
    const mcpServer = new AirtableMCPServer(airtableService);

    // Create SSE transport bound to the request/response
    const transport = new SSEServerTransport({
      req: req as unknown as any,
      res: res as unknown as any,
    });

    await mcpServer.connect(transport);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Server error: ${message}`);
  }
}


