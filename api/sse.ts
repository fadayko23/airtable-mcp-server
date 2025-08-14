import type {VercelRequest, VercelResponse} from '@vercel/node';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';

// Minimal SSE MCP endpoint for OpenAI Connector
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('SSE endpoint called:', req.method, req.url);
  console.log('Request headers:', req.headers);
  console.log('Query parameters:', req.query);
  
  // Allow both GET and POST for MCP connections
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'GET, POST').send('Method Not Allowed');
    return;
  }

  // Log the session ID if present
  if (req.query.sessionId) {
    console.log('Session ID received:', req.query.sessionId);
  }

  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
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
    
    // Test Airtable connectivity
    try {
      console.log('Testing Airtable connectivity...');
      const bases = await airtableService.listBases();
      console.log('Airtable connectivity test successful, found', bases.bases.length, 'bases');
    } catch (error) {
      console.error('Airtable connectivity test failed:', error);
      throw new Error(`Airtable connectivity test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    console.log('Creating MCP server...');
    const mcpServer = new AirtableMCPServer(airtableService);
    
    // Validate MCP server configuration
    console.log('MCP server created:', typeof mcpServer);
    console.log('MCP server methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(mcpServer)));
    
    // Ensure the server is properly configured
    if (!mcpServer || typeof mcpServer !== 'object') {
      throw new Error('Failed to create MCP server');
    }

    console.log('Creating SSE transport...');
    // Create SSE transport with the correct path for Vercel
    // The path should match the endpoint URL that ChatGPT is calling
    // ChatGPT is calling /api/sse, so we need to use that exact path
    const transport = new SSEServerTransport('/api/sse', res);
    console.log('SSE transport created with path:', '/api/sse');
    
    // Validate transport configuration
    console.log('Transport object created:', typeof transport);
    console.log('Transport methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(transport)));
    
    // Ensure the transport is properly configured
    if (!transport || typeof transport !== 'object') {
      throw new Error('Failed to create SSE transport');
    }
    
    console.log('Connecting MCP server to transport...');
    await mcpServer.connect(transport);
    console.log('MCP server connected successfully');
    
    // Validate that the connection is working
    console.log('Validating MCP connection...');
    try {
      // Try to list tools to verify the connection is working
      const tools = await mcpServer['handleListTools']();
      console.log('MCP connection validation successful, tools available:', tools.tools.length);
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
    
    // The connection should now be established and ChatGPT can communicate
    // The SSE transport will handle the MCP protocol messages automatically
    
    // Set a timeout to keep the connection alive for a reasonable time
    // This prevents the function from terminating immediately
    setTimeout(() => {
      console.log('Connection timeout reached, but MCP should be working');
    }, 30000); // 30 seconds
    
    // Add a heartbeat to keep the connection alive
    const heartbeat = setInterval(() => {
      console.log('MCP connection heartbeat - connection still alive');
    }, 10000); // Every 10 seconds
    
    // Clean up heartbeat on function termination
    process.on('beforeExit', () => {
      console.log('Function terminating, cleaning up...');
      clearInterval(heartbeat);
    });
    
    // Don't end the response - let the SSE transport handle it
    // The transport will keep the connection open for MCP communication
    
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SSE handler error:', err);
    console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    
    // Only send error response if we haven't already started the SSE stream
    if (!res.headersSent) {
      res.status(500).send(`Server error: ${message}`);
    } else {
      console.error('Cannot send error response - headers already sent');
    }
  }
}


