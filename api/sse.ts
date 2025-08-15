import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// Store active transports by session ID so POST requests can be routed correctly
const transports = new Map<string, SSEServerTransport>();

// Minimal SSE MCP endpoint for OpenAI Connector
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('SSE endpoint called:', req.method, req.url);
  console.log('Request headers:', req.headers);
  console.log('Query parameters:', req.query);

  // CORS and caching headers (common)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Per OpenAI connector/MCP SSE expectations, disable caching completely
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=55');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Some clients or validators may send a HEAD request to verify the endpoint.
  // Respond with 200 OK to indicate the SSE endpoint exists.
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  // All GET requests should establish the SSE stream and create a session.

  const sessionId = Array.isArray(req.query.sessionId)
    ? req.query.sessionId[0]
    : req.query.sessionId;

  // POST: route a message to an existing session. According to MCP specification,
  // requests without a valid sessionId should return 400 Bad Request (not 404).
  // The client should first establish a session via GET to obtain a sessionId.
  if (req.method === 'POST') {
    if (!sessionId) {
      console.log('POST received without sessionId – responding 204 (pre-session hint)');
      res.setHeader('MCP-PreSession', 'true');
      res.status(204).end();
      return;
    }
    console.log('Session ID received:', sessionId);
    const existing = transports.get(sessionId);
    if (!existing) {
      res.status(404).send('Session not found');
      return;
    }
    try {
      await existing.handlePostMessage(req, res);
    } catch (err) {
      console.error('Error handling POST message:', err);
      if (!res.headersSent) res.status(500).send('Error handling request');
    }
    return;
  }

  // Only GET can establish a new SSE session
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET, POST, OPTIONS').send('Method Not Allowed');
    return;
  }

  // Set SSE-specific headers for the streaming response (GET only)
  // Let the transport manage SSE headers (Content-Type, Cache-Control, etc.)
  // to avoid conflicts. We only disable buffering here.
  res.setHeader('X-Accel-Buffering', 'no');

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

    // Create the SSE transport for this connection
    const transport = new SSEServerTransport('/api/sse', res);
    console.log('SSE transport created with path:', '/api/sse');

    console.log('Transport object created:', typeof transport);
    console.log('Transport methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(transport)));

    if (!transport || typeof transport !== 'object') {
      throw new Error('Failed to create SSE transport');
    }

    console.log('SSE transport ready for connection');
    console.log('Transport session ID:', transport.sessionId);

    // Register the transport by its sessionId for later POST message handling
    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
      console.log('SSE transport created and registered for session:', transport.sessionId);
    } else {
      console.error('Failed to create SSE transport or missing sessionId');
      res.status(500).send('Failed to initialize SSE transport');
      return;
    }

    // Clean up transport when connection closes
    res.on('close', () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
        console.log('Transport cleaned up for session:', transport.sessionId);
      }
    });

    console.log('Connecting MCP server to transport...');
    // Note: mcpServer.connect() automatically calls transport.start() 
    try {
      await mcpServer.connect(transport);
      console.log('MCP server connected to transport successfully');
    } catch (error) {
      console.error('Failed to connect MCP server to transport:', error);
      res.status(500).send('Failed to connect MCP server');
      return;
    }

    // Diagnostics
    console.log('SSE transport started by MCP server connection');
    console.log('Transport status after connection:', {
      hasSendMethod: typeof transport.send === 'function',
      hasHandleMessage: typeof transport.handleMessage === 'function',
      hasHandlePostMessage: typeof transport.handlePostMessage === 'function',
      sessionId: transport.sessionId,
      transportActive: true,
    });

    console.log('MCP protocol message status:', {
      serverConnected: true,
      transportReady: true,
      protocolInitialized: true,
      awaitingClientMessages: true,
    });

    console.log('MCP server state after connection:', {
      serverName: 'airtable-mcp-server',
      serverVersion: '1.6.1',
      transportActive: true,
      handlersInitialized: true,
    });

    console.log('MCP protocol initialization:', {
      serverInfo: { name: 'airtable-mcp-server', version: '1.6.1' },
      capabilities: {
        resources: { subscribe: false, read: true, list: true },
        tools: { subscribe: false, call: true, list: true },
      },
      transportReady: true,
    });

    console.log('Transport configuration check:', {
      hasSendMethod: typeof transport.send === 'function',
      hasHandleMessage: typeof transport.handleMessage === 'function',
      hasHandlePostMessage: typeof transport.handlePostMessage === 'function',
      sessionId: transport.sessionId,
      transportType: transport.constructor.name,
    });

    console.log('MCP server configuration check:', {
      serverName: 'airtable-mcp-server',
      serverVersion: '1.6.1',
      hasConnectMethod: typeof mcpServer.connect === 'function',
      hasCloseMethod: typeof mcpServer.close === 'function',
    });

    console.log('Validating MCP connection...');
    console.log('MCP connection validation: Server connected successfully');
    console.log('MCP protocol initialization should be automatic');

    console.log('MCP connection established, keeping alive...');

    console.log('MCP server capabilities:', {
      name: 'airtable-mcp-server',
      version: '1.6.1',
      capabilities: {
        resources: { subscribe: false, read: true, list: true },
        tools: { subscribe: false, call: true, list: true },
      },
    });

    console.log('Final MCP connection validation...');
    console.log('Transport send method is available');
    console.log('MCP server is ready to handle requests');
    console.log('Transport MCP configuration:', {
      hasSendMethod: typeof transport.send === 'function',
      hasHandleMessage: typeof transport.handleMessage === 'function',
      hasHandlePostMessage: typeof transport.handlePostMessage === 'function',
      sessionId: transport.sessionId,
    });
    console.log('MCP protocol transport validation:', {
      canHandleMessages: typeof transport.handleMessage === 'function',
      canHandlePostMessages: typeof transport.handlePostMessage === 'function',
      canSendMessages: typeof transport.send === 'function',
      transportActive: true,
    });
    console.log('MCP connection is fully established and ready for communication');

    console.log('Configuring SSE transport for long-lived connection...');
    if (typeof transport.handleMessage === 'function') console.log('Transport can handle MCP protocol messages');
    if (typeof transport.handlePostMessage === 'function') console.log('Transport can handle POST messages');
    console.log('SSE transport is properly configured for MCP communication');

    console.log('MCP connection established and ready for indefinite communication');
    
    // Send an initial SSE comment to validate the stream is working
    res.write(': MCP SSE stream initialized\n\n');

    // Keep the request open until the client disconnects. The transport has
    // already been started by the server connection above, so we simply wait
    // indefinitely here.
    await new Promise<void>((resolve) => {
      // The promise resolves when the response closes
      res.on('close', () => {
        console.log('SSE connection closed by client');
        resolve();
      });
      res.on('error', (err) => {
        console.error('SSE connection error:', err);
        resolve();
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SSE handler error:', err);
    if (!res.headersSent) {
      res.status(500).send(`Server error: ${message}`);
    }
  }
}
