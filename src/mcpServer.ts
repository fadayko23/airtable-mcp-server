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
import {type z} from 'zod';
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
			mimeType: 'application/json',
			text: JSON.stringify(data),
		}],
		isError,
	};
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
		console.log('MCP handleListTools called - returning tool definitions');
		const result = {
			tools: [
				{
					name: 'list_records',
					description: 'List records from a table',
					inputSchema: getInputSchema(ListRecordsArgsSchema),
				},
				{
					name: 'search_records',
					description: 'Search for records containing specific text',
					inputSchema: getInputSchema(SearchRecordsArgsSchema),
				},
				{
					name: 'list_bases',
					description: 'List all accessible Airtable bases',
					inputSchema: {
						type: 'object' as const,
						properties: {},
						required: [],
						additionalProperties: false,
					},
				},
				{
					name: 'list_tables',
					description: 'List all tables in a specific base',
					inputSchema: getInputSchema(ListTablesArgsSchema),
				},
				{
					name: 'describe_table',
					description: 'Get detailed information about a specific table',
					inputSchema: getInputSchema(DescribeTableArgsSchema),
				},
				{
					name: 'get_record',
					description: 'Get a specific record by ID',
					inputSchema: getInputSchema(GetRecordArgsSchema),
				},
				{
					name: 'create_record',
					description: 'Create a new record in a table',
					inputSchema: getInputSchema(CreateRecordArgsSchema),
				},
				{
					name: 'update_records',
					description: 'Update up to 10 records in a table',
					inputSchema: getInputSchema(UpdateRecordsArgsSchema),
				},
				{
					name: 'delete_records',
					description: 'Delete records from a table',
					inputSchema: getInputSchema(DeleteRecordsArgsSchema),
				},
				{
					name: 'create_table',
					description: 'Create a new table in a base',
					inputSchema: getInputSchema(CreateTableArgsSchema),
				},
				{
					name: 'update_table',
					description: 'Update a table\'s name or description',
					inputSchema: getInputSchema(UpdateTableArgsSchema),
				},
				{
					name: 'create_field',
					description: 'Create a new field in a table',
					inputSchema: getInputSchema(CreateFieldArgsSchema),
				},
				{
					name: 'update_field',
					description: 'Update a field\'s name or description',
					inputSchema: getInputSchema(UpdateFieldArgsSchema),
				},
			],
		};
		console.log(`MCP handleListTools returning ${result.tools.length} tools`);
		return result;
	}

	private async handleCallTool(request: z.infer<typeof CallToolRequestSchema>): Promise<CallToolResult> {
		try {
			switch (request.params.name) {
				case 'list_records': {
					const args = ListRecordsArgsSchema.parse(request.params.arguments);
					const records = await this.airtableService.listRecords(
						args.baseId,
						args.tableId,
						{
							view: args.view,
							maxRecords: args.maxRecords,
							filterByFormula: args.filterByFormula,
							sort: args.sort,
						},
					);
					return formatToolResponse(records);
				}

				case 'search_records': {
					const args = SearchRecordsArgsSchema.parse(request.params.arguments);
					const records = await this.airtableService.searchRecords(
						args.baseId,
						args.tableId,
						args.searchTerm,
						args.fieldIds,
						args.maxRecords,
						args.view,
					);
					return formatToolResponse(records);
				}

				case 'list_bases': {
					const {bases} = await this.airtableService.listBases();
					return formatToolResponse(bases.map((base) => ({
						id: base.id,
						name: base.name,
						permissionLevel: base.permissionLevel,
					})));
				}

				case 'list_tables': {
					const args = ListTablesArgsSchema.parse(request.params.arguments);
					const schema = await this.airtableService.getBaseSchema(args.baseId);
					return formatToolResponse(schema.tables.map((table) => {
						switch (args.detailLevel) {
							case 'tableIdentifiersOnly':
								return {
									id: table.id,
									name: table.name,
								};
							case 'identifiersOnly':
								return {
									id: table.id,
									name: table.name,
									fields: table.fields.map((field) => ({
										id: field.id,
										name: field.name,
									})),
									views: table.views.map((view) => ({
										id: view.id,
										name: view.name,
									})),
								};
							case 'full':
							// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check, no-fallthrough
							default:
								return {
									id: table.id,
									name: table.name,
									description: table.description,
									fields: table.fields,
									views: table.views,
								};
						}
					}));
				}

				case 'describe_table': {
					const args = DescribeTableArgsSchema.parse(request.params.arguments);
					const schema = await this.airtableService.getBaseSchema(args.baseId);
					const table = schema.tables.find((t) => t.id === args.tableId);

					if (!table) {
						return formatToolResponse(`Table ${args.tableId} not found in base ${args.baseId}`, true);
					}

					switch (args.detailLevel) {
						case 'tableIdentifiersOnly':
							return formatToolResponse({
								id: table.id,
								name: table.name,
							});
						case 'identifiersOnly':
							return formatToolResponse({
								id: table.id,
								name: table.name,
								fields: table.fields.map((field) => ({
									id: field.id,
									name: field.name,
								})),
								views: table.views.map((view) => ({
									id: view.id,
									name: view.name,
								})),
							});
						case 'full':
						// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check, no-fallthrough
						default:
							return formatToolResponse({
								id: table.id,
								name: table.name,
								description: table.description,
								fields: table.fields,
								views: table.views,
							});
					}
				}

				case 'get_record': {
					const args = GetRecordArgsSchema.parse(request.params.arguments);
					const record = await this.airtableService.getRecord(args.baseId, args.tableId, args.recordId);
					return formatToolResponse({
						id: record.id,
						fields: record.fields,
					});
				}

				case 'create_record': {
					const args = CreateRecordArgsSchema.parse(request.params.arguments);
					const record = await this.airtableService.createRecord(args.baseId, args.tableId, args.fields);
					return formatToolResponse({
						id: record.id,
						fields: record.fields,
					});
				}

				case 'update_records': {
					const args = UpdateRecordsArgsSchema.parse(request.params.arguments);
					const records = await this.airtableService.updateRecords(args.baseId, args.tableId, args.records);
					return formatToolResponse(records.map((record) => ({
						id: record.id,
						fields: record.fields,
					})));
				}

				case 'delete_records': {
					const args = DeleteRecordsArgsSchema.parse(request.params.arguments);
					const records = await this.airtableService.deleteRecords(args.baseId, args.tableId, args.recordIds);
					return formatToolResponse(records.map((record) => ({
						id: record.id,
					})));
				}

				case 'create_table': {
					const args = CreateTableArgsSchema.parse(request.params.arguments);
					const table = await this.airtableService.createTable(
						args.baseId,
						args.name,
						args.fields,
						args.description,
					);
					return formatToolResponse(table);
				}

				case 'update_table': {
					const args = UpdateTableArgsSchema.parse(request.params.arguments);
					const table = await this.airtableService.updateTable(
						args.baseId,
						args.tableId,
						{name: args.name, description: args.description},
					);
					return formatToolResponse(table);
				}

				case 'create_field': {
					const args = CreateFieldArgsSchema.parse(request.params.arguments);
					const field = await this.airtableService.createField(
						args.baseId,
						args.tableId,
						args.nested.field,
					);
					return formatToolResponse(field);
				}

				case 'update_field': {
					const args = UpdateFieldArgsSchema.parse(request.params.arguments);
					const field = await this.airtableService.updateField(
						args.baseId,
						args.tableId,
						args.fieldId,
						{
							name: args.name,
							description: args.description,
						},
					);
					return formatToolResponse(field);
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
