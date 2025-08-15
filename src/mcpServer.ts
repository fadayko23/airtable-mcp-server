import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
	type CallToolResult,
	type ListToolsResult,
	type ReadResourceResult,
	type ListResourcesResult,
} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {type Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {
	ListRecordsArgsSchema,
	ListTablesArgsSchema,
	DescribeTableArgsSchema,
	GetRecordArgsSchema,
	CreateRecordArgsSchema,
	UpdateRecordsArgsSchema,
	DeleteRecordsArgsSchema,
	CreateTableArgsSchema,
	UpdateTableArgsSchema,
	CreateFieldArgsSchema,
	UpdateFieldArgsSchema,
	SearchRecordsArgsSchema,
	type IAirtableService,
	type IAirtableMCPServer,
} from './types.js';

const getInputSchema = (schema: z.ZodType<object>): ListToolsResult['tools'][0]['inputSchema'] => {
	const jsonSchema = zodToJsonSchema(schema);
	if (!('type' in jsonSchema) || jsonSchema.type !== 'object') {
		throw new Error(`Invalid input schema to convert in airtable-mcp-server: expected an object but got ${'type' in jsonSchema ? String(jsonSchema.type) : 'no type'}`);
	}

	// Ensure strict JSON Schema compliance for OpenAI validator
	const result = {...jsonSchema, type: 'object' as const};
	
	// Remove any unsupported properties that might cause validation issues
	delete (result as any).$schema;
	delete (result as any).additionalProperties;
	
	return result;
};

const formatToolResponse = (data: unknown, isError = false): CallToolResult => {
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
	type: 'object' as const,
	properties: {
		name: {type: 'string' as const},
		type: {type: 'string' as const},
		description: {type: 'string' as const},
		options: {type: 'object' as const},
	},
	required: ['name', 'type'] as string[],
	additionalProperties: false,
};

export class AirtableMCPServer implements IAirtableMCPServer {
	private readonly server: Server;

	constructor(private readonly airtableService: IAirtableService) {
		this.server = new Server(
			{
				name: 'airtable-mcp-server',
				version: '1.6.1',
			},
			{
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
			},
		);
		this.initializeHandlers();
	}

	async connect(transport: Transport): Promise<void> {
		console.log('MCP server connecting to transport...');
		await this.server.connect(transport);
		console.log('MCP server connected to transport successfully');
	}

	async close(): Promise<void> {
		await this.server.close();
	}

	private initializeHandlers(): void {
		console.log('Initializing MCP server handlers...');
		this.server.setRequestHandler(ListResourcesRequestSchema, this.handleListResources.bind(this));
		this.server.setRequestHandler(ReadResourceRequestSchema, this.handleReadResource.bind(this));
		this.server.setRequestHandler(ListToolsRequestSchema, this.handleListTools.bind(this));
		this.server.setRequestHandler(CallToolRequestSchema, this.handleCallTool.bind(this));
		console.log('MCP server handlers initialized');
	}

	private async handleListResources(): Promise<ListResourcesResult> {
		const {bases} = await this.airtableService.listBases();
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

	private async handleReadResource(request: z.infer<typeof ReadResourceRequestSchema>): Promise<ReadResourceResult> {
		const {uri} = request.params;
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

	private async handleListTools(): Promise<ListToolsResult> {
		console.log('MCP handleListTools called - returning minimal tool set (search, fetch)');
		const result = {
			tools: [
				{
					name: 'search',
					description: 'Search for content and return a list of results with id, title, text, url',
					inputSchema: {
						type: 'object' as const,
						properties: { query: { type: 'string' as const } },
						required: ['query'] as string[],
						additionalProperties: false,
					},
				},
				{
					name: 'fetch',
					description: 'Fetch a single result by id and return id, title, text, url, metadata',
					inputSchema: {
						type: 'object' as const,
						properties: { id: { type: 'string' as const } },
						required: ['id'] as string[],
						additionalProperties: false,
					},
				},
			],
		};
		console.log(`MCP handleListTools returning ${result.tools.length} tools`);
		return result as unknown as ListToolsResult;
	}

	private async handleCallTool(request: z.infer<typeof CallToolRequestSchema>): Promise<CallToolResult> {
		try {
			switch (request.params.name) {
				case 'search': {
					const Args = z.object({ query: z.string() });
					const { query } = Args.parse(request.params.arguments);
					const { bases } = await this.airtableService.listBases();
					if (!bases.length) return formatToolResponse([]);
					const baseId = bases[0].id;
					const baseSchema = await this.airtableService.getBaseSchema(baseId);
					const table = baseSchema.tables[0];
					if (!table) return formatToolResponse([]);
					const records = await this.airtableService.searchRecords(baseId, table.id, query, undefined, 10);
					const results = records.map((r) => ({
						id: `${baseId}:${table.id}:${r.id}`,
						title: `${table.name} record ${r.id}`,
						text: JSON.stringify(r.fields).slice(0, 200),
						url: '',
					}));
					return formatToolResponse(results);
				}

				case 'fetch': {
					const Args = z.object({ id: z.string() });
					const { id } = Args.parse(request.params.arguments);
					const parts = id.split(':');
					if (parts.length !== 3) return formatToolResponse('Invalid id format. Expected baseId:tableId:recordId', true);
					const [baseId, tableId, recordId] = parts;
					const record = await this.airtableService.getRecord(baseId, tableId, recordId);
					const payload = {
						id: record.id,
						title: `${tableId} ${record.id}`,
						text: JSON.stringify(record.fields),
						url: '',
						metadata: { baseId, tableId },
					};
					return formatToolResponse(payload);
				}

				default: {
					throw new Error(`Unknown tool: ${request.params.name}`);
				}
			}
		} catch (error) {
			return formatToolResponse(
				`Error in tool ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`,
				true,
			);
		}
	}
}
