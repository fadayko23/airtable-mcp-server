import type {VercelRequest, VercelResponse} from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').send('Method Not Allowed');
    return;
  }

  try {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const hasApiKey = !!apiKey;
    
    res.status(200).json({
      status: 'ok',
      message: 'Airtable MCP Server is running',
      hasApiKey,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      status: 'error',
      message: `Server error: ${message}`
    });
  }
}
