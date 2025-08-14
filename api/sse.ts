import type {VercelRequest, VercelResponse} from '@vercel/node';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';

// Minimal SSE MCP endpoint for OpenAI Connector
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET for SSE handshake
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').send('Method Not Allowed');
    return;
  }

  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    // Import from the built files in dist
    const {AirtableService} = await import('../dist/src/airtableService.js');
    const {AirtableMCPServer} = await import('../dist/src/mcpServer.js');
    
    const airtableService = new AirtableService();
    const mcpServer = new AirtableMCPServer(airtableService);

    // Create SSE transport with the correct path for Vercel
    const transport = new SSEServerTransport('/sse', res);

    await mcpServer.connect(transport);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SSE handler error:', err);
    res.status(500).send(`Server error: ${message}`);
  }
}


