import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// Store active transports by session ID so POST requests can be routed correctly
const transports = new Map<string, SSEServerTransport>();

// Minimal SSE MCP endpoint for OpenAI Connector
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('SSE endpoint called:', req.method, req.url);
  console.log('Request headers:', req.headers);
  console.log('Query parameters:', req.query);

  // CORS and caching headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const sessionId = Array.isArray(req.query.sessionId)
    ? req.query.sessionId[0]
    : req.query.sessionId;

  // Handle POST messages for existing sessions
  if (req.method === 'POST' && sessionId) {
    console.log('Session ID received:', sessionId);
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).send('Session not found');
      return;
    }
    try {
      await transport.handlePostMessage(req, res);
    } catch (err) {
      console.error('Error handling POST message:', err);
      if (!res.headersSent) res.status(500).send('Error handling request');
    }
    return;
  }

  // Only allow GET or initial POST without session ID to establish connection
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'GET, POST, OPTIONS').send('Method Not Allowed');
    return;
  }

  try {
    console.log('Checking for API key...');
    const apiKey = process.env.AIRTABLE_API_KEY;
    if (!apiKey) {
      console.error('AIRTABLE_API_KEY environment variable is not set');
      res.status(500).send('Server configuration error: Missing Airtable API key');
      return;
    }

    console.log('Importing MCP classes...');
    const { AirtableService } = await import('../dist/airtableService.js');
    const { AirtableMCPServer } = await import('../dist/mcpServer.js');
    console.log('MCP classes imported successfully');

    console.log('Creating Airtable service...');
    const airtableService = new AirtableService(apiKey);

    console.log('Testing Airtable connectivity...');
    await airtableService.listBases();
    console.log('Airtable connectivity test successful');

    console.log('Creating MCP server...');
    const mcpServer = new AirtableMCPServer(airtableService);

    console.log('Creating SSE transport...');
    const transport = new SSEServerTransport('/api/sse', res);
    console.log('SSE transport created with session:', transport.sessionId);

    // Keep track of transport for subsequent POST requests
    transports.set(transport.sessionId, transport);
    res.on('close', () => transports.delete(transport.sessionId));

    console.log('Connecting MCP server to transport...');
    await mcpServer.connect(transport);
    console.log('MCP server connected successfully');

    // Basic validation
    await mcpServer['handleListTools']();
    console.log('MCP connection established');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SSE handler error:', err);
    if (!res.headersSent) {
      res.status(500).send(`Server error: ${message}`);
    }
  }
}
