import type {VercelRequest, VercelResponse} from '@vercel/node';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';

// Minimal SSE MCP endpoint for OpenAI Connector
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('SSE endpoint called:', req.method, req.url);
  
  // Only allow GET for SSE handshake
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').send('Method Not Allowed');
    return;
  }

  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    console.log('Checking for API key...');
    // Check if API key is available
    const apiKey = process.env.AIRTABLE_API_KEY;
    if (!apiKey) {
      console.error('AIRTABLE_API_KEY environment variable is not set');
      res.status(500).send('Server configuration error: Missing Airtable API key');
      return;
    }
    console.log('API key found, length:', apiKey.length);

    console.log('Importing MCP classes...');
    // Import the compiled classes
    const {AirtableService} = await import('../dist/airtableService.js');
    const {AirtableMCPServer} = await import('../dist/mcpServer.js');
    console.log('MCP classes imported successfully');

    console.log('Creating Airtable service...');
    const airtableService = new AirtableService(apiKey);
    console.log('Creating MCP server...');
    const mcpServer = new AirtableMCPServer(airtableService);

    console.log('Creating SSE transport...');
    // Create SSE transport with the correct path for Vercel
    const transport = new SSEServerTransport('/api/sse', res);

    console.log('Connecting MCP server to transport...');
    await mcpServer.connect(transport);
    console.log('MCP server connected successfully');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SSE handler error:', err);
    res.status(500).send(`Server error: ${message}`);
  }
}


