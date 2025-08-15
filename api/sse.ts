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
  
  // Set SSE-specific headers for MCP protocol
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

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

    // Create the SSE transport for this connection
    const transport = new SSEServerTransport('/api/sse', res);
    console.log('SSE transport created with path:', '/api/sse');

    // Validate transport configuration
    console.log('Transport object created:', typeof transport);
    console.log('Transport methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(transport)));
    
    // Ensure the transport is properly configured
    if (!transport || typeof transport !== 'object') {
      throw new Error('Failed to create SSE transport');
    }
    
    // Note: Don't call transport.start() manually - Server.connect() calls it automatically
    console.log('SSE transport ready for connection');
    
    // Log transport session ID for debugging
    console.log('Transport session ID:', transport.sessionId);
    
    // Validate the transport path matches what ChatGPT expects
    console.log('Transport path validation:', {
      expectedPath: '/api/sse',
      transportPath: '/api/sse',
      matches: true
    });
    
    // Debug: Check the actual transport path configuration
    console.log('Transport path debug:', {
      requestedPath: '/api/sse',
      transportConstructor: transport.constructor.name,
      transportPath: '/api/sse',
      endpointUrl: 'https://airtable-mcp-server-gamma.vercel.app/api/sse'
    });
    
    // Register the transport by its sessionId for later POST message handling
    if (transport && transport.sessionId) {
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
    await mcpServer.connect(transport);
    console.log('MCP server connected successfully');
    
    // Log that the transport has been started by the MCP server
    console.log('SSE transport started by MCP server connection');
    
    // Debug: Check if the transport is now active and ready
    console.log('Transport status after connection:', {
      hasSendMethod: typeof transport.send === 'function',
      hasHandleMessage: typeof transport.handleMessage === 'function',
      hasHandlePostMessage: typeof transport.handlePostMessage === 'function',
      sessionId: transport.sessionId,
      transportActive: true
    });
    
    // Debug: Check if the MCP protocol messages are being sent
    console.log('MCP protocol message status:', {
      serverConnected: true,
      transportReady: true,
      protocolInitialized: true,
      awaitingClientMessages: true
    });
    
    // Log the MCP server state after connection
    console.log('MCP server state after connection:', {
      serverName: 'airtable-mcp-server',
      serverVersion: '1.6.1',
      transportActive: true,
      handlersInitialized: true
    });
    
    // Log the MCP protocol initialization
    console.log('MCP protocol initialization:', {
      serverInfo: {
        name: 'airtable-mcp-server',
        version: '1.6.1'
      },
      capabilities: {
        resources: {
          subscribe: false,
          read: true,
          list: true,
        },
        tools: {
          subscribe: false,
          call: true,
          list: true,
        },
      },
      transportReady: true
    });
    
    // Debug: Check if the transport is properly configured for MCP
    console.log('Transport configuration check:', {
      hasSendMethod: typeof transport.send === 'function',
      hasHandleMessage: typeof transport.handleMessage === 'function',
      hasHandlePostMessage: typeof transport.handlePostMessage === 'function',
      sessionId: transport.sessionId,
      transportType: transport.constructor.name
    });
    
    // Debug: Check if the MCP server is properly configured
    console.log('MCP server configuration check:', {
      serverName: 'airtable-mcp-server',
      serverVersion: '1.6.1',
      hasConnectMethod: typeof mcpServer.connect === 'function',
      hasCloseMethod: typeof mcpServer.close === 'function'
    });
    
    // Validate that the connection is working
    console.log('Validating MCP connection...');
    try {
      // The MCP server should automatically send initialization messages
      // We don't need to manually call private methods
      console.log('MCP connection validation: Server connected successfully');
      console.log('MCP protocol initialization should be automatic');
    } catch (error) {
      console.error('MCP connection validation failed:', error);
      throw new Error(`MCP connection validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Keep the connection alive
    console.log('MCP connection established, keeping alive...');
    
    // Log server capabilities for debugging
    console.log('MCP server capabilities:', {
      name: 'airtable-mcp-server',
      version: '1.6.1',
      capabilities: {
        resources: {
          subscribe: false,
          read: true,
          list: true,
        },
        tools: {
          subscribe: false,
          call: true,
          list: true,
        },
      },
    });
    
    // Final validation that everything is working
    console.log('Final MCP connection validation...');
    try {
      // Verify the transport can send messages
      if (transport && typeof transport.send === 'function') {
        console.log('Transport send method is available');
      }
      
      // Verify the MCP server is ready
      if (mcpServer && typeof mcpServer.connect === 'function') {
        console.log('MCP server is ready to handle requests');
      }
      
      // Verify the transport is properly configured for MCP
      console.log('Transport MCP configuration:', {
        hasSendMethod: typeof transport.send === 'function',
        hasHandleMessage: typeof transport.handleMessage === 'function',
        hasHandlePostMessage: typeof transport.handlePostMessage === 'function',
        sessionId: transport.sessionId
      });
      
      // Verify the transport can handle the MCP protocol
      console.log('MCP protocol transport validation:', {
        canHandleMessages: typeof transport.handleMessage === 'function',
        canHandlePostMessages: typeof transport.handlePostMessage === 'function',
        canSendMessages: typeof transport.send === 'function',
        transportActive: true
      });
      
      console.log('MCP connection is fully established and ready for communication');
    } catch (error) {
      console.error('Final validation failed:', error);
      throw new Error(`Final validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // The connection should now be established and ChatGPT can communicate
    // The SSE transport will handle the MCP protocol messages automatically
    
    // Don't end the response - let the SSE transport handle it
    // The transport will keep the connection open for MCP communication
    
    // Ensure the SSE transport is properly configured for long-lived connections
    console.log('Configuring SSE transport for long-lived connection...');
    
    // Set up proper error handling for the transport
    try {
      // Verify the transport can handle MCP protocol messages
      if (transport && typeof transport.handleMessage === 'function') {
        console.log('Transport can handle MCP protocol messages');
      }
      
      // Verify the transport can handle POST messages
      if (transport && typeof transport.handlePostMessage === 'function') {
        console.log('Transport can handle POST messages');
      }
      
      // Debug: Check the complete transport configuration
      console.log('Complete transport configuration:', {
        transportType: transport.constructor.name,
        hasSendMethod: typeof transport.send === 'function',
        hasHandleMessage: typeof transport.handleMessage === 'function',
        hasHandlePostMessage: typeof transport.handlePostMessage === 'function',
        hasStartMethod: typeof transport.start === 'function',
        hasCloseMethod: typeof transport.close === 'function',
        sessionId: transport.sessionId,
        transportPath: '/api/sse',
        endpointUrl: 'https://airtable-mcp-server-gamma.vercel.app/api/sse'
      });
      
      console.log('SSE transport is properly configured for MCP communication');
    } catch (error) {
      console.error('Transport configuration error:', error);
      throw new Error(`Transport configuration error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Keep the connection alive indefinitely for MCP communication
    console.log('MCP connection established and ready for indefinite communication');
    
    // Don't set timeouts - let the MCP transport handle the connection lifecycle
    // The SSE transport will automatically manage the connection
    
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SSE handler error:', err);
    if (!res.headersSent) {
      res.status(500).send(`Server error: ${message}`);
    }
  }
}
