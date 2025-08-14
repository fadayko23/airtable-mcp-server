# ChatGPT Connector Deployment Guide

## Prerequisites

1. **Airtable API Key**: You need a valid Airtable personal access token with appropriate permissions
2. **Vercel Account**: For hosting the MCP server
3. **GitHub Repository**: Connected to Vercel for automatic deployments

## Environment Variables

Set the following environment variable in your Vercel project:

```
AIRTABLE_API_KEY=your_airtable_personal_access_token_here
```

**Important**: The API key must have at least:
- `schema.bases:read` - to list bases and tables
- `data.records:read` - to read records
- Optional: `data.records:write` - to create/update/delete records

## Deployment Steps

1. **Push your code to GitHub**
2. **Connect your repository to Vercel**
3. **Set the environment variable** in Vercel dashboard
4. **Deploy** - Vercel will automatically build and deploy

## Testing the Connection

### 1. Test the basic endpoint
Visit: `https://your-vercel-app.vercel.app/api/test`

You should see:
```json
{
  "status": "ok",
  "message": "Airtable MCP Server is running",
  "hasApiKey": true,
  "timestamp": "...",
  "environment": "production"
}
```

### 2. Test the SSE endpoint
Visit: `https://your-vercel-app.vercel.app/api/sse`

You should see the MCP server establish a connection.

## ChatGPT Connector Setup

1. **URL**: Use `https://your-vercel-app.vercel.app/api/sse`
2. **Authentication**: Set to "No authentication" (the MCP server handles this internally)
3. **Trust Application**: Check this box

## Troubleshooting

### "Error creating connector"

**Common causes:**
1. **Missing API Key**: Check that `AIRTABLE_API_KEY` is set in Vercel
2. **Build Issues**: Ensure the TypeScript compilation succeeds
3. **Import Errors**: Check Vercel logs for import failures
4. **MCP Protocol**: Verify the server implements the protocol correctly

**Debug steps:**
1. Check Vercel function logs for errors
2. Verify the test endpoint works
3. Ensure all dependencies are properly installed
4. Check that the dist/ folder contains compiled JavaScript files

### Connection Issues

**If the SSE endpoint fails:**
1. Check Vercel function timeout settings
2. Verify CORS headers are set correctly
3. Ensure the MCP server can connect to Airtable API
4. Check for any TypeScript compilation errors

## MCP Protocol Requirements

The server must:
1. Respond to `initialize` requests
2. Provide proper capabilities in the response
3. Handle `tools/list` requests
4. Handle `resources/list` requests
5. Implement all declared tools and resources

## Support

If you continue to have issues:
1. Check the Vercel function logs
2. Verify your Airtable API key permissions
3. Test with a simple MCP client first
4. Check the MCP specification for protocol compliance
