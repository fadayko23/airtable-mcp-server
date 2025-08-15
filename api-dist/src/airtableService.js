import { z } from 'zod';
import { ListBasesResponseSchema, BaseSchemaResponseSchema, TableSchema, FieldSchema, } from './types.js';
import { enhanceAirtableError } from './enhanceAirtableError.js';
export class AirtableService {
    apiKey;
    baseUrl;
    fetch;
    constructor(apiKey = process.env.AIRTABLE_API_KEY || '', baseUrl = 'https://api.airtable.com', fetchFn = fetch) {
        this.apiKey = apiKey.trim();
        if (!this.apiKey) {
            throw new Error('airtable-mcp-server: No API key provided. Set it in the `AIRTABLE_API_KEY` environment variable');
        }
        this.baseUrl = baseUrl;
        this.fetch = fetchFn;
    }
    async listBases() {
        return this.fetchFromAPI('/v0/meta/bases', ListBasesResponseSchema);
    }
    async getBaseSchema(baseId) {
        return this.fetchFromAPI(`/v0/meta/bases/${baseId}/tables`, BaseSchemaResponseSchema);
    }
    async listRecords(baseId, tableId, options = {}) {
        let allRecords = [];
        let offset;
        do {
            const queryParams = new URLSearchParams();
            if (options.maxRecords) {
                queryParams.append('maxRecords', options.maxRecords.toString());
            }
            if (options.filterByFormula) {
                queryParams.append('filterByFormula', options.filterByFormula);
            }
            if (options.view) {
                queryParams.append('view', options.view);
            }
            if (offset) {
                queryParams.append('offset', offset);
            }
            // Add sort parameters if provided
            if (options.sort && options.sort.length > 0) {
                options.sort.forEach((sortOption, index) => {
                    queryParams.append(`sort[${index}][field]`, sortOption.field);
                    if (sortOption.direction) {
                        queryParams.append(`sort[${index}][direction]`, sortOption.direction);
                    }
                });
            }
            // eslint-disable-next-line no-await-in-loop
            const response = await this.fetchFromAPI(`/v0/${baseId}/${tableId}?${queryParams.toString()}`, z.object({
                records: z.array(z.object({ id: z.string(), fields: z.record(z.any()) })),
                offset: z.string().optional(),
            }));
            allRecords = allRecords.concat(response.records);
            offset = response.offset;
        } while (offset);
        return allRecords;
    }
    async getRecord(baseId, tableId, recordId) {
        return this.fetchFromAPI(`/v0/${baseId}/${tableId}/${recordId}`, z.object({ id: z.string(), fields: z.record(z.any()) }));
    }
    async createRecord(baseId, tableId, fields) {
        return this.fetchFromAPI(`/v0/${baseId}/${tableId}`, z.object({ id: z.string(), fields: z.record(z.any()) }), {
            method: 'POST',
            body: JSON.stringify({ fields }),
        });
    }
    async updateRecords(baseId, tableId, records) {
        const response = await this.fetchFromAPI(`/v0/${baseId}/${tableId}`, z.object({ records: z.array(z.object({ id: z.string(), fields: z.record(z.any()) })) }), {
            method: 'PATCH',
            body: JSON.stringify({ records }),
        });
        return response.records;
    }
    async deleteRecords(baseId, tableId, recordIds) {
        const queryString = recordIds.map((id) => `records[]=${id}`).join('&');
        const response = await this.fetchFromAPI(`/v0/${baseId}/${tableId}?${queryString}`, z.object({ records: z.array(z.object({ id: z.string(), deleted: z.boolean() })) }), {
            method: 'DELETE',
        });
        return response.records.map(({ id }) => ({ id }));
    }
    async createTable(baseId, name, fields, description) {
        return this.fetchFromAPI(`/v0/meta/bases/${baseId}/tables`, TableSchema, {
            method: 'POST',
            body: JSON.stringify({ name, description, fields }),
        });
    }
    async updateTable(baseId, tableId, updates) {
        return this.fetchFromAPI(`/v0/meta/bases/${baseId}/tables/${tableId}`, TableSchema, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }
    async createField(baseId, tableId, field) {
        return this.fetchFromAPI(`/v0/meta/bases/${baseId}/tables/${tableId}/fields`, FieldSchema, {
            method: 'POST',
            body: JSON.stringify(field),
        });
    }
    async updateField(baseId, tableId, fieldId, updates) {
        return this.fetchFromAPI(`/v0/meta/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, FieldSchema, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }
    async searchRecords(baseId, tableId, searchTerm, fieldIds, maxRecords, view) {
        // Validate and get search fields (FIELD NAMES for formula references)
        const searchFields = await this.validateAndGetSearchFields(baseId, tableId, fieldIds);
        // Escape the search term to prevent formula injection
        const escapedTerm = searchTerm.replace(/["\\]/g, '\\$&');
        // Build OR(FIND("term", "" & {FieldName}), ...)
        // Using "" & {FieldName} coerces arrays/lookups into strings so FIND works
        const filterByFormula = `OR(${searchFields
            .map((fieldName) => `FIND("${escapedTerm}", "" & {${fieldName}})`)
            .join(',')})`;
        return this.listRecords(baseId, tableId, { maxRecords, filterByFormula, view });
    }
    async validateAndGetSearchFields(baseId, tableId, requestedFieldIds) {
        const schema = await this.getBaseSchema(baseId);
        const table = schema.tables.find((t) => t.id === tableId);
        if (!table) {
            throw new Error(`Table ${tableId} not found in base ${baseId}`);
        }
        const searchableFieldTypes = [
            'singleLineText',
            'multilineText',
            'richText',
            'email',
            'url',
            'phoneNumber',
            'lookup',
            'rollup',
        ];
        // Return FIELD NAMES (not IDs) so we can reference them directly in formulas
        const searchableFields = table.fields
            .filter((field) => searchableFieldTypes.includes(field.type))
            .map((field) => field.name);
        if (searchableFields.length === 0) {
            throw new Error('No text fields available to search');
        }
        // If specific fields were requested, validate they exist and are text-like fields
        if (requestedFieldIds && requestedFieldIds.length > 0) {
            // Treat requestedFieldIds as FIELD NAMES
            const invalidFields = requestedFieldIds.filter((fieldName) => !searchableFields.includes(fieldName));
            if (invalidFields.length > 0) {
                throw new Error(`Invalid fields requested: ${invalidFields.join(', ')}`);
            }
            return requestedFieldIds;
        }
        return searchableFields;
    }
    async fetchFromAPI(endpoint, schema, options = {}) {
        const response = await this.fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });
        const responseText = await response.text();
        if (!response.ok) {
            const error = new Error(`Airtable API Error: ${response.statusText}. Response: ${responseText}`);
            enhanceAirtableError(error, responseText, this.apiKey);
            throw error;
        }
        try {
            const data = JSON.parse(responseText);
            return schema.parse(data);
        }
        catch (parseError) {
            throw new Error(`Failed to parse API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
    }
}
