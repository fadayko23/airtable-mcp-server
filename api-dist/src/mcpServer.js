import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
const getInputSchema = (schema) => {
    const jsonSchema = zodToJsonSchema(schema);
    if (!('type' in jsonSchema) || jsonSchema.type !== 'object') {
        throw new Error(`Invalid input schema to convert in airtable-mcp-server: expected an object but got ${'type' in jsonSchema ? String(jsonSchema.type) : 'no type'}`);
    }
    // Ensure strict JSON Schema compliance for OpenAI validator
    const result = { ...jsonSchema, type: 'object' };
    // Remove any unsupported properties that might cause validation issues
    delete result.$schema;
    delete result.additionalProperties;
    return result;
};
const formatToolResponse = (data, isError = false) => {
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(data),
            }],
        isError,
    };
};
// Simplified JSON Schemas for OpenAI connector validation
const SIMPLE_FIELD_JSON_SCHEMA = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        type: { type: 'string' },
        description: { type: 'string' },
        options: { type: 'object' },
    },
    required: ['name', 'type'],
    additionalProperties: false,
};
export class AirtableMCPServer {
    airtableService;
    server;
    constructor(airtableService) {
        this.airtableService = airtableService;
        this.server = new Server({
            name: 'airtable-mcp-server',
            version: '1.6.1',
        }, {
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
        this.initializeHandlers();
    }
    async connect(transport) {
        console.log('MCP server connecting to transport...');
        await this.server.connect(transport);
        console.log('MCP server connected to transport successfully');
    }
    async close() {
        await this.server.close();
    }
    initializeHandlers() {
        console.log('Initializing MCP server handlers...');
        this.server.setRequestHandler(ListResourcesRequestSchema, this.handleListResources.bind(this));
        this.server.setRequestHandler(ReadResourceRequestSchema, this.handleReadResource.bind(this));
        this.server.setRequestHandler(ListToolsRequestSchema, this.handleListTools.bind(this));
        this.server.setRequestHandler(CallToolRequestSchema, this.handleCallTool.bind(this));
        console.log('MCP server handlers initialized');
    }
    async handleListResources() {
        const { bases } = await this.airtableService.listBases();
        const resources = await Promise.all(bases.map(async (base) => {
            const schema = await this.airtableService.getBaseSchema(base.id);
            return schema.tables.map((table) => ({
                uri: `airtable://${base.id}/${table.id}/schema`,
                mimeType: 'application/json',
                name: `${base.name}: ${table.name} schema`,
            }));
        }));
        return {
            resources: resources.flat(),
        };
    }
    async handleReadResource(request) {
        const { uri } = request.params;
        const match = /^airtable:\/\/([^/]+)\/([^/]+)\/schema$/.exec(uri);
        if (!match?.[1] || !match[2]) {
            throw new Error('Invalid resource URI');
        }
        const [, baseId, tableId] = match;
        const schema = await this.airtableService.getBaseSchema(baseId);
        const table = schema.tables.find((t) => t.id === tableId);
        if (!table) {
            throw new Error(`Table ${tableId} not found in base ${baseId}`);
        }
        return {
            contents: [
                {
                    uri: request.params.uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                        baseId,
                        tableId: table.id,
                        name: table.name,
                        description: table.description,
                        primaryFieldId: table.primaryFieldId,
                        fields: table.fields,
                        views: table.views,
                    }),
                },
            ],
        };
    }
    async handleListTools() {
        console.log('MCP handleListTools called - returning minimal tool set (search, fetch)');
        const result = {
            tools: [
                {
                    name: 'search',
                    description: 'Search for content and return a list of results with id, title, text, url',
                    inputSchema: {
                        type: 'object',
                        properties: { query: { type: 'string' } },
                        required: ['query'],
                        additionalProperties: false,
                    },
                },
                {
                    name: 'fetch',
                    description: 'Fetch a single result by id and return id, title, text, url, metadata',
                    inputSchema: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id'],
                        additionalProperties: false,
                    },
                },
            ],
        };
        console.log(`MCP handleListTools returning ${result.tools.length} tools`);
        return result;
    }
    async handleCallTool(request) {
        try {
            switch (request.params.name) {
                case 'search': {
                    const Args = z.object({ query: z.string() });
                    const { query } = Args.parse(request.params.arguments);
                    const { bases } = await this.airtableService.listBases();
                    if (!bases.length)
                        return formatToolResponse([]);
                    // Optional allowlist of bases via env var (comma-separated)
                    const allowBaseIds = (process.env.MCP_SEARCH_BASE_IDS ?? '')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                    const maxTotalResults = Number.parseInt(process.env.MCP_SEARCH_MAX_TOTAL ?? '100', 10);
                    const perTableLimit = Number.parseInt(process.env.MCP_SEARCH_PER_TABLE_LIMIT ?? '10', 10);
                    const results = [];
                    for (const base of bases) {
                        if (allowBaseIds.length > 0 && !allowBaseIds.includes(base.id))
                            continue;
                        // eslint-disable-next-line no-await-in-loop
                        const baseSchema = await this.airtableService.getBaseSchema(base.id);
                        for (const table of baseSchema.tables) {
                            if (results.length >= maxTotalResults)
                                break;
                            try {
                                // eslint-disable-next-line no-await-in-loop
                                const records = await this.airtableService.searchRecords(base.id, table.id, query, undefined, perTableLimit);
                                const primaryField = table.fields.find((f) => f.id === table.primaryFieldId);
                                const primaryFieldName = primaryField?.name;
                                for (const r of records) {
                                    if (results.length >= maxTotalResults)
                                        break;
                                    const stringify = (val) => {
                                        if (val == null)
                                            return '';
                                        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
                                            return String(val);
                                        if (Array.isArray(val))
                                            return val.map((v) => stringify(v)).filter(Boolean).join(', ');
                                        if (typeof val === 'object') {
                                            // common Airtable object shapes (attachments, linked records)
                                            try {
                                                return JSON.stringify(val);
                                            }
                                            catch {
                                                return '';
                                            }
                                        }
                                        return '';
                                    };
                                    // Build a prioritized snippet using primary field and known text-like fields
                                    const prioritizedFieldNames = [
                                        primaryFieldName,
                                        'Project Name', 'Project Complete Address', 'Project Additional Notes',
                                        'Company Name', 'Property Name', 'Client', 'Client Name', 'Owner', 'Status',
                                    ].filter(Boolean);
                                    const seen = new Set();
                                    const orderedFieldNames = [];
                                    for (const name of prioritizedFieldNames) {
                                        if (!seen.has(name) && r.fields[name] !== undefined) {
                                            seen.add(name);
                                            orderedFieldNames.push(name);
                                        }
                                    }
                                    // fill with any other string-like fields
                                    for (const [name, val] of Object.entries(r.fields)) {
                                        if (seen.has(name))
                                            continue;
                                        const s = stringify(val);
                                        if (s) {
                                            seen.add(name);
                                            orderedFieldNames.push(name);
                                        }
                                        if (orderedFieldNames.length >= 8)
                                            break;
                                    }
                                    const parts = orderedFieldNames.map((name) => `${name}: ${stringify(r.fields[name])}`);
                                    const snippet = (parts.join(' | ') || JSON.stringify(r.fields)).slice(0, 400);
                                    const primaryValue = primaryFieldName ? stringify(r.fields[primaryFieldName]) : '';
                                    const titleSuffix = primaryValue ? primaryValue : r.id;
                                    const url = `https://airtable.com/${base.id}/${table.id}/${r.id}`;
                                    results.push({
                                        id: `${base.id}:${table.id}:${r.id}`,
                                        title: `${base.name} – ${table.name} – ${titleSuffix}`,
                                        text: snippet,
                                        url,
                                    });
                                }
                            }
                            catch {
                                // ignore table errors
                            }
                        }
                        if (results.length >= maxTotalResults)
                            break;
                    }
                    return formatToolResponse(results);
                }
                case 'fetch': {
                    const Args = z.object({ id: z.string() });
                    const { id } = Args.parse(request.params.arguments);
                    const parts = id.split(':');
                    if (parts.length !== 3)
                        return formatToolResponse('Invalid id format. Expected baseId:tableId:recordId', true);
                    const [baseId, tableId, recordId] = parts;
                    const [record, baseSchema] = await Promise.all([
                        this.airtableService.getRecord(baseId, tableId, recordId),
                        this.airtableService.getBaseSchema(baseId),
                    ]);
                    const table = baseSchema.tables.find((t) => t.id === tableId);
                    const primaryFieldName = table?.fields.find((f) => f.id === table?.primaryFieldId)?.name;
                    const title = primaryFieldName && record.fields[primaryFieldName]
                        ? String(record.fields[primaryFieldName])
                        : `${table?.name ?? tableId} ${record.id}`;
                    const url = `https://airtable.com/${baseId}/${tableId}/${record.id}`;
                    const payload = {
                        id: record.id,
                        title,
                        text: JSON.stringify(record.fields),
                        url,
                        metadata: { baseId, tableId },
                    };
                    return formatToolResponse(payload);
                }
                default: {
                    throw new Error(`Unknown tool: ${request.params.name}`);
                }
            }
        }
        catch (error) {
            return formatToolResponse(`Error in tool ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`, true);
        }
    }
}
