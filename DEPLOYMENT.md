# Vercel Deployment Guide

This guide explains how to deploy the Airtable MCP Server to Vercel for use with OpenAI's MCP Connector.

## Prerequisites

- Airtable Personal Access Token with permissions:
  - `schema.bases:read`
  - `data.records:read` 
  - `data.records:write` (optional)
- Airtable Base ID
- Vercel account

## Environment Variables

Set these in your Vercel project settings:

- `AIRTABLE_API_KEY`: Your Airtable personal access token
- `AIRTABLE_BASE_ID`: Your Airtable base ID

## Deployment Steps

1. **Push to GitHub**: Ensure your repository is connected to Vercel
2. **Deploy**: Vercel will automatically build and deploy using the `vercel.json` configuration
3. **Get URL**: Your SSE endpoint will be available at `https://<your-domain>.vercel.app/sse`

## Configuration Files

### vercel.json
Routes `/sse` requests to the `/api/sse` serverless function with standard Vercel Node.js runtime.

### api/sse.ts
Serverless function that:
- Creates an MCP server instance
- Uses SSE transport for streaming responses
- Handles GET requests only (per MCP spec)
- Includes CORS headers for cross-origin requests

### Dependencies
- Added `@vercel/node` for proper Vercel TypeScript support
- Uses compiled classes from `dist/` directory

## OpenAI Connector Setup

1. Go to OpenAI Platform → Connectors → New Connector
2. Set MCP Server URL to: `https://<your-vercel-domain>.vercel.app/sse`
3. Choose authentication method (OAuth recommended)
4. Check "I trust this application"
5. Click Create

## Testing

The endpoint should respond to GET requests at `/sse` with Server-Sent Events stream containing MCP protocol messages.

## Troubleshooting

- **Build errors**: Ensure TypeScript compiles locally with `npm run build`
- **Runtime errors**: Check Vercel function logs for detailed error messages
- **Connection issues**: Verify the SSE endpoint URL is accessible and returns proper headers
- **Function runtime errors**: Ensure `@vercel/node` dependency is installed
