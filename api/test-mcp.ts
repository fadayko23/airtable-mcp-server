import type {VercelRequest, VercelResponse} from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').send('Method Not Allowed');
    return;
  }

  try {
    const apiKey = process.env.AIRTABLE_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        status: 'error',
        message: 'Missing Airtable API key'
      });
      return;
    }

    // Test MCP server creation
    const {AirtableService} = await import('../dist/airtableService.js');
    const {AirtableMCPServer} = await import('../dist/mcpServer.js');
    
    const airtableService = new AirtableService(apiKey);
    const mcpServer = new AirtableMCPServer(airtableService);
    
    // Test basic functionality
    const bases = await airtableService.listBases();
    
    res.status(200).json({
      status: 'ok',
      message: 'MCP server test successful',
      mcpServer: {
        name: 'airtable-mcp-server',
        version: '1.6.1',
        capabilities: {
          resources: { subscribe: false, read: true, list: true },
          tools: { subscribe: false, call: true, list: true }
        }
      },
      airtable: {
        basesCount: bases.bases.length,
        firstBase: bases.bases[0] ? {
          id: bases.bases[0].id,
          name: bases.bases[0].name
        } : null
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MCP test error:', err);
    res.status(500).json({
      status: 'error',
      message: `MCP test failed: ${message}`,
      error: err instanceof Error ? err.stack : String(err)
    });
  }
}
