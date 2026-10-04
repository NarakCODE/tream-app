import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const postmanDir = path.resolve(__dirname, '../postman');

const envPath = path.join(postmanDir, 'tream-local.postman_environment.json');
const colPath = path.join(postmanDir, 'tream-m01-m04.postman_collection.json');
const completeColPath = path.join(postmanDir, 'tream-complete.postman_collection.json');

const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));
const col = JSON.parse(fs.readFileSync(colPath, 'utf8'));

// Helper for standard test script
function standardTest(statusCode, extraTests = [], extraCode = []) {
  const lines = [
    `pm.test('HTTP ${statusCode}', () => pm.response.to.have.status(${statusCode}));`,
    `pm.test('Correlation ID exists', () => pm.expect(pm.response.headers.get('x-request-id')).to.be.a('string'));`,
    `pm.test('Success envelope', () => { const b = pm.response.json(); pm.expect(b).to.have.property('data'); pm.expect(b.meta.requestId).to.be.a('string'); });`,
    ...extraTests,
    ...extraCode,
  ];
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: lines,
    },
  };
}

function commandPrerequest() {
  return {
    listen: 'prerequest',
    script: {
      type: 'text/javascript',
      exec: ["pm.variables.set('commandKey', pm.variables.replaceIn('{{$guid}}'));"],
    },
  };
}

function jsonHeaders(includeIdempotency = false) {
  const headers = [
    { key: 'Accept', value: 'application/json' },
  ];
  if (includeIdempotency) {
    headers.push({ key: 'Idempotency-Key', value: '{{commandKey}}' });
  }
  headers.push({ key: 'Content-Type', value: 'application/json' });
  return headers;
}

// 1. UPDATE ENVIRONMENT VARIABLES
const newEnvVars = [
  { key: 'initiativeId', value: '', enabled: true, type: 'default' },
  { key: 'initiativeRevision', value: '1', enabled: true, type: 'default' },
  { key: 'initiativeName', value: 'Postman Strategic Roadmap', enabled: true, type: 'default' },
  { key: 'initiativeTargetDate', value: '2026-12-31', enabled: true, type: 'default' },
  { key: 'initiativeCursor', value: '', enabled: true, type: 'default' },
  { key: 'initiativeUpdateId', value: '', enabled: true, type: 'default' },
  { key: 'initiativeUpdateRevision', value: '1', enabled: true, type: 'default' },
  { key: 'initiativeProjectIds', value: '[]', enabled: true, type: 'default' },
  { key: 'documentId', value: '', enabled: true, type: 'default' },
  { key: 'documentRevision', value: '1', enabled: true, type: 'default' },
  { key: 'documentTitle', value: 'Postman System Architecture Spec', enabled: true, type: 'default' },
  { key: 'documentBody', value: '# System Architecture\\n\\nThis document outlines architecture and API designs.', enabled: true, type: 'default' },
  { key: 'documentCursor', value: '', enabled: true, type: 'default' },
  { key: 'viewId', value: '', enabled: true, type: 'default' },
  { key: 'viewRevision', value: '1', enabled: true, type: 'default' },
  { key: 'viewName', value: 'High Priority Open Issues', enabled: true, type: 'default' },
  { key: 'viewCursor', value: '', enabled: true, type: 'default' },
  { key: 'favoriteId', value: '', enabled: true, type: 'default' },
  { key: 'favoriteRevision', value: '1', enabled: true, type: 'default' },
  { key: 'favoriteCursor', value: '', enabled: true, type: 'default' },
  { key: 'favoriteItems', value: '[]', enabled: true, type: 'default' },
  { key: 'searchQuery', value: 'Postman', enabled: true, type: 'default' },
  { key: 'notificationId', value: '', enabled: true, type: 'default' },
  { key: 'notificationRevision', value: '1', enabled: true, type: 'default' },
  { key: 'notificationCursor', value: '', enabled: true, type: 'default' },
  { key: 'notificationPreferencesRevision', value: '0', enabled: true, type: 'default' },
  { key: 'auditCursor', value: '', enabled: true, type: 'default' },
  { key: 'trashCursor', value: '', enabled: true, type: 'default' },
  { key: 'workspaceTrashCursor', value: '', enabled: true, type: 'default' },
  { key: 'outboxCursor', value: '', enabled: true, type: 'default' },
];

const existingKeys = new Set(env.values.map(v => v.key));
for (const item of newEnvVars) {
  if (!existingKeys.has(item.key)) {
    env.values.push(item);
  }
}

// 2. BUILD NEW FOLDERS

// FOLDER 13: Initiatives
const initiativesFolder = {
  name: '13 Initiatives — manual',
  description: '19 mounted routes for strategic initiatives. Covers initiative creation, listing, detail, metadata update, linking projects, reordering linked projects, unlinking projects, progress calculation, publishing health updates, update listing, editing updates, deleting updates, subscriber listing, subscription management (subscribe/unsubscribe), and lifecycle (archive, restore, delete). Every mutation requires latest initiativeRevision or updateRevision.',
  item: [
    {
      name: 'Create initiative',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives',
        description: 'Creates a workspace initiative without initial projects so that Link project to initiative can link {{projectId}} explicitly.',
        body: {
          mode: 'raw',
          raw: '{\n  "name": "{{initiativeName}}",\n  "description": "Strategic initiative for Q4 deliverables",\n  "status": "PLANNED",\n  "targetDate": "{{initiativeTargetDate}}"\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(201, [], [
          'if (pm.response.code === 201) {',
          '  const d = pm.response.json().data;',
          '  pm.environment.set(\'initiativeId\', d.id);',
          '  if (d.revision) pm.environment.set(\'initiativeRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'List initiatives',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives?lifecycle=active&limit={{limit}}',
        description: 'Lists active initiatives for workspace with cursor pagination.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const b = pm.response.json();',
          '  if (b.meta && b.meta.nextCursor) pm.environment.set(\'initiativeCursor\', b.meta.nextCursor);',
          '}',
        ]),
      ],
    },
    {
      name: 'Get initiative and refresh revision',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}',
        description: 'Fetches single initiative details and captures current revision.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'initiativeRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Update initiative',
      request: {
        method: 'PATCH',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}',
        description: 'Updates initiative name and status with revision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeRevision}},\n  "name": "{{initiativeName}} (Active)",\n  "status": "ACTIVE"\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'initiativeRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Link project to initiative',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/projects',
        description: 'Links an active project to this initiative. Returns updated initiative entity and increments revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeRevision}},\n  "projectId": "{{projectId}}"\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(201, [], [
          'if (pm.response.code === 201) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'initiativeRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'List linked projects',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/projects',
        description: 'Lists all projects linked to this initiative.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const list = pm.response.json().data;',
          '  if (Array.isArray(list)) {',
          '    pm.environment.set(\'initiativeProjectIds\', JSON.stringify(list.map(p => p.id || p.projectId)));',
          '  }',
          '}',
        ]),
      ],
    },
    {
      name: 'Reorder linked projects',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/projects/reorder',
        description: 'Reorders linked projects within the initiative. Increments initiative revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeRevision}},\n  "projectIds": ["{{projectId}}"]\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'initiativeRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Unlink project from initiative',
      request: {
        method: 'DELETE',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/projects/{{projectId}}',
        description: 'Unlinks project from initiative with revision check. Increments initiative revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'initiativeRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Get initiative progress',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/progress',
        description: 'Computes overall progress rollups across linked projects and issues.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
    {
      name: 'Publish initiative update',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/updates',
        description: 'Publishes a health and progress report update for stakeholders.',
        body: {
          mode: 'raw',
          raw: '{\n  "body": "Initiative milestones progressing as planned.",\n  "health": "ON_TRACK"\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(201, [], [
          'if (pm.response.code === 201) {',
          '  const d = pm.response.json().data;',
          '  pm.environment.set(\'initiativeUpdateId\', d.id);',
          '  if (d.revision) pm.environment.set(\'initiativeUpdateRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'List initiative updates',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/updates?limit={{limit}}',
        description: 'Lists published initiative health updates in reverse chronological order.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
    {
      name: 'Edit initiative update',
      request: {
        method: 'PATCH',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/updates/{{initiativeUpdateId}}',
        description: 'Edits the content or health status of a published update.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeUpdateRevision}},\n  "body": "Updated progress report with latest metrics.",\n  "health": "ON_TRACK"\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'initiativeUpdateRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Delete initiative update',
      request: {
        method: 'DELETE',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/updates/{{initiativeUpdateId}}',
        description: 'Removes an initiative update with revision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeUpdateRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200),
      ],
    },
    {
      name: 'List initiative subscribers',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/subscribers?limit={{limit}}',
        description: 'Lists subscribed members notified on updates.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
    {
      name: 'Subscribe to initiative',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/subscription',
        description: 'Subscribes caller to receive notification events for this initiative.',
        body: {
          mode: 'raw',
          raw: '{}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(201),
      ],
    },
    {
      name: 'Unsubscribe from initiative',
      request: {
        method: 'DELETE',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/subscription',
        description: 'Unsubscribes caller from initiative updates.',
        body: {
          mode: 'raw',
          raw: '{}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200),
      ],
    },
    {
      name: 'Archive initiative',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/archive',
        description: 'Moves initiative to archived state. Increments initiative revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'initiativeRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Restore archived initiative',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}/restore',
        description: 'Restores archived initiative back to active state. Increments initiative revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'initiativeRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Delete initiative',
      request: {
        method: 'DELETE',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/initiatives/{{initiativeId}}',
        description: 'Soft-deletes initiative to workspace trash with revision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{initiativeRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200),
      ],
    },
  ],
};

// FOLDER 14: Documents
const documentsFolder = {
  name: '14 Documents — manual',
  description: '7 mounted routes for documents. Documents can be scoped to projects, teams, or initiatives. Features plain-text body validation, markdown content, cursor pagination, revision-checked updates, and complete lifecycle (archive, restore, and delete).',
  item: [
    {
      name: 'Create document for project',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/documents',
        description: 'Creates a project-scoped document. Owner can also be team or initiative.',
        body: {
          mode: 'raw',
          raw: '{\n  "ownerType": "project",\n  "ownerId": "{{projectId}}",\n  "title": "{{documentTitle}}",\n  "body": "# Architecture Spec\\n\\nTechnical specification for local testing."\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(201, [], [
          'if (pm.response.code === 201) {',
          '  const d = pm.response.json().data;',
          '  pm.environment.set(\'documentId\', d.id);',
          '  if (d.revision) pm.environment.set(\'documentRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'List documents',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/documents?ownerType=project&ownerId={{projectId}}&lifecycle=active&limit={{limit}}',
        description: 'Lists active documents for project with cursor pagination.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const b = pm.response.json();',
          '  if (b.meta && b.meta.nextCursor) pm.environment.set(\'documentCursor\', b.meta.nextCursor);',
          '}',
        ]),
      ],
    },
    {
      name: 'Get document and refresh revision',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/documents/{{documentId}}',
        description: 'Fetches document content and updates current documentRevision.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'documentRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Update document',
      request: {
        method: 'PATCH',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/documents/{{documentId}}',
        description: 'Updates document title and markdown body with expected revision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{documentRevision}},\n  "title": "{{documentTitle}} (Updated)",\n  "body": "# Architecture Spec (v2)\\n\\nUpdated technical notes."\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'documentRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Archive document',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/documents/{{documentId}}/archive',
        description: 'Archives document with revision check. Increments document revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{documentRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'documentRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Restore archived document',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/documents/{{documentId}}/restore',
        description: 'Restores archived document back to active state. Increments document revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{documentRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'documentRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Delete document',
      request: {
        method: 'DELETE',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/documents/{{documentId}}',
        description: 'Deletes document to trash with revision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{documentRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200),
      ],
    },
  ],
};

// FOLDER 15: Views and search
const viewsFolder = {
  name: '15 Views and search — manual',
  description: '14 mounted routes for permission-filtered saved views, ad-hoc query execution, favorites with drag-and-drop ordering, and unified search across issues, projects, and documents. Uses version 1 filter grammar with strict validation.',
  item: [
    {
      name: 'Create saved view',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views',
        description: 'Creates a saved view for issues or projects with version 1 filter grammar.',
        body: {
          mode: 'raw',
          raw: '{\n  "name": "{{viewName}}",\n  "resource": "ISSUES",\n  "visibility": "WORKSPACE",\n  "filters": {\n    "version": 1,\n    "sort": "CREATED_DESC"\n  },\n  "display": {\n    "layout": "list",\n    "groupBy": "status"\n  }\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(201, [], [
          'if (pm.response.code === 201) {',
          '  const d = pm.response.json().data;',
          '  pm.environment.set(\'viewId\', d.id);',
          '  if (d.revision) pm.environment.set(\'viewRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'List saved views',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views?resource=ISSUES&lifecycle=active&limit={{limit}}',
        description: 'Lists saved views matching resource and lifecycle filters.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const b = pm.response.json();',
          '  if (b.meta && b.meta.nextCursor) pm.environment.set(\'viewCursor\', b.meta.nextCursor);',
          '}',
        ]),
      ],
    },
    {
      name: 'Query dynamic view ad-hoc',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views/query',
        description: 'Executes an ad-hoc query with version 1 filters without saving a persistent view.',
        body: {
          mode: 'raw',
          raw: '{\n  "resource": "ISSUES",\n  "filters": {\n    "version": 1,\n    "sort": "CREATED_DESC"\n  },\n  "limit": 25\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200),
      ],
    },
    {
      name: 'Get saved view and refresh revision',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views/{{viewId}}',
        description: 'Reads saved view definition and captures latest revision.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'viewRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Run saved view query results',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views/{{viewId}}/results?limit={{limit}}',
        description: 'Runs saved view query with current user permissions and returns item results.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
    {
      name: 'Update saved view',
      request: {
        method: 'PATCH',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views/{{viewId}}',
        description: 'Updates saved view metadata, filters, or display config with revision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{viewRevision}},\n  "name": "{{viewName}} (Updated)",\n  "filters": {\n    "version": 1,\n    "sort": "CREATED_DESC"\n  }\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'viewRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Archive view',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views/{{viewId}}/archive',
        description: 'Archives view with revision check. Increments view revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{viewRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'viewRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Restore archived view',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views/{{viewId}}/restore',
        description: 'Restores archived view to active status. Increments view revision.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{viewRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'viewRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Delete view',
      request: {
        method: 'DELETE',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/views/{{viewId}}',
        description: 'Deletes view to trash with revision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{viewRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200),
      ],
    },
    {
      name: 'Add favorite',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/favorites',
        description: 'Pins a project, issue, team, initiative, or view to user sidebar favorites.',
        body: {
          mode: 'raw',
          raw: '{\n  "targetType": "project",\n  "targetId": "{{projectId}}"\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(201, [], [
          'if (pm.response.code === 201) {',
          '  const d = pm.response.json().data;',
          '  pm.environment.set(\'favoriteId\', d.id);',
          '  if (d.revision) pm.environment.set(\'favoriteRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'List user favorites',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/favorites?limit={{limit}}',
        description: 'Lists user favorites sorted by rank position.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const b = pm.response.json();',
          '  if (b.meta && b.meta.nextCursor) pm.environment.set(\'favoriteCursor\', b.meta.nextCursor);',
          '  if (Array.isArray(b.data) && b.data.length > 0) {',
          '    pm.environment.set(\'favoriteItems\', JSON.stringify(b.data.map(f => ({ id: f.id, expectedRevision: f.revision }))));',
          '    const cur = b.data.find(f => f.id === pm.environment.get(\'favoriteId\'));',
          '    if (cur && cur.revision) pm.environment.set(\'favoriteRevision\', String(cur.revision));',
          '  }',
          '}',
        ]),
      ],
    },
    {
      name: 'Reorder favorites',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/favorites/reorder',
        description: 'Updates positional order of user favorites with revisions.',
        body: {
          mode: 'raw',
          raw: '{\n  "items": [\n    {\n      "id": "{{favoriteId}}",\n      "expectedRevision": {{favoriteRevision}}\n    }\n  ]\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const curRev = Number(pm.environment.get(\'favoriteRevision\')) || 1;',
          '  pm.environment.set(\'favoriteRevision\', String(curRev + 1));',
          '}',
        ]),
      ],
    },
    {
      name: 'Remove favorite',
      request: {
        method: 'DELETE',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/favorites/{{favoriteId}}',
        description: 'Unfavorites target item with revision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{favoriteRevision}}\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200),
      ],
    },
    {
      name: 'Unified search',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/search?q={{searchQuery}}&resource=ALL&limit={{limit}}',
        description: 'Performs unified token search across issues, projects, and documents with permission filters.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
  ],
};

// FOLDER 16: Notifications
const notificationsFolder = {
  name: '16 Notifications — manual',
  description: '10 mounted routes for notifications, user notification preferences, and delivery attempt auditing and retries. Includes inbox/archived/snoozed filtering, unread counters, snooze scheduling, and delivery retry controls. Note: notification actions require a valid notificationId generated from an event or mention.',
  item: [
    {
      name: 'List notifications',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications?status=all&limit={{limit}}',
        description: 'Lists user notifications for workspace with status and unread filters.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const b = pm.response.json();',
          '  if (b.meta && b.meta.nextCursor) pm.environment.set(\'notificationCursor\', b.meta.nextCursor);',
          '  if (Array.isArray(b.data) && b.data.length > 0) {',
          '    pm.environment.set(\'notificationId\', b.data[0].id);',
          '    if (b.data[0].revision) pm.environment.set(\'notificationRevision\', String(b.data[0].revision));',
          '  }',
          '}',
        ]),
      ],
    },
    {
      name: 'Get unread count',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/unread-count',
        description: 'Returns total unread notification badge count.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
    {
      name: 'Get notification preferences',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/preferences',
        description: 'Returns in-app and email notification channel preferences for current caller.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && typeof d.revision === \'number\') {',
          '    pm.environment.set(\'notificationPreferencesRevision\', String(d.revision));',
          '  }',
          '}',
        ]),
      ],
    },
    {
      name: 'Update notification preferences',
      request: {
        method: 'PATCH',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/preferences',
        description: 'Updates notification channel settings with expectedRevision check.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{notificationPreferencesRevision}},\n  "inAppEnabled": true,\n  "emailEnabled": true\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && typeof d.revision === \'number\') {',
          '    pm.environment.set(\'notificationPreferencesRevision\', String(d.revision));',
          '  }',
          '}',
        ]),
      ],
    },
    {
      name: 'Get notification details and refresh revision',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/{{notificationId}}',
        description: 'Reads single notification and captures current revision. Requires active notificationId.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'notificationRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Mark notification read or unread',
      request: {
        method: 'PATCH',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/{{notificationId}}/read',
        description: 'Toggles notification read state. Requires active notificationId.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{notificationRevision}},\n  "read": true\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'notificationRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Archive or unarchive notification',
      request: {
        method: 'PATCH',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/{{notificationId}}/archive',
        description: 'Toggles notification archived state. Requires active notificationId.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{notificationRevision}},\n  "archived": true\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'notificationRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'Snooze notification',
      request: {
        method: 'PATCH',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/{{notificationId}}/snooze',
        description: 'Snoozes notification until specified ISO8601 timestamp. Requires active notificationId.',
        body: {
          mode: 'raw',
          raw: '{\n  "expectedRevision": {{notificationRevision}},\n  "snoozedUntil": "2026-12-31T23:59:59.000Z"\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const d = pm.response.json().data;',
          '  if (d && d.revision) pm.environment.set(\'notificationRevision\', String(d.revision));',
          '}',
        ]),
      ],
    },
    {
      name: 'List notification delivery attempts',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/{{notificationId}}/deliveries',
        description: 'Lists delivery attempts across in-app and email channels with status codes. Requires active notificationId.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
    {
      name: 'Retry delivery attempt',
      request: {
        method: 'POST',
        header: jsonHeaders(true),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/notifications/{{notificationId}}/deliveries/retry',
        description: 'Retries failed notification delivery attempt. Requires active notificationId.',
        body: {
          mode: 'raw',
          raw: '{\n  "acknowledgePossibleDuplicate": true\n}',
          options: { raw: { language: 'json' } },
        },
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        commandPrerequest(),
        standardTest(200),
      ],
    },
  ],
};

// FOLDER 17: Audit history
const auditFolder = {
  name: '17 Audit history — manual',
  description: 'Auditing query routes. Provides cursor-paginated append-only immutable audit history for workspaces, members, projects, issues, cycles, documents, and labels with filter support for actor, action, and target.',
  item: [
    {
      name: 'List workspace audit events',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/audit?limit={{limit}}',
        description: 'Lists audit logs across the workspace in reverse chronological order.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const b = pm.response.json();',
          '  if (b.meta && b.meta.nextCursor) pm.environment.set(\'auditCursor\', b.meta.nextCursor);',
          '}',
        ]),
      ],
    },
    {
      name: 'Filter audit events by target',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/audit?targetType=workspace&limit={{limit}}',
        description: 'Filters audit logs by targetType, actorId, action, or correlationId.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
  ],
};

// FOLDER 18: Retention and trash
const retentionFolder = {
  name: '18 Retention and trash — manual',
  description: '3 mounted routes for system retention policy and multi-tenant trash queries. Exposes workspace-level retention terms, workspace trash catalog (issues, projects, documents, initiatives, views, comments, files), and user-level deleted/archived workspace listings.',
  item: [
    {
      name: 'Get workspace retention policy',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/retention-policy',
        description: 'Returns tenant-specific recoverable trash windows, purge schedules, and preserved immutable invariants.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
    {
      name: 'List items in workspace trash',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/trash?limit={{limit}}',
        description: 'Lists recoverable soft-deleted resources in workspace with optional resourceType filter.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const b = pm.response.json();',
          '  if (b.meta && b.meta.nextCursor) pm.environment.set(\'trashCursor\', b.meta.nextCursor);',
          '}',
        ]),
      ],
    },
    {
      name: 'List user deleted and archived workspaces',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/trash?limit={{limit}}',
        description: 'Lists all deleted or archived workspaces owned or administered by the caller.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200, [], [
          'if (pm.response.code === 200) {',
          '  const b = pm.response.json();',
          '  if (b.meta && b.meta.nextCursor) pm.environment.set(\'workspaceTrashCursor\', b.meta.nextCursor);',
          '}',
        ]),
      ],
    },
  ],
};

// FOLDER 19: Eventing outbox
const outboxFolder = {
  name: '19 Eventing outbox — manual',
  description: 'Transactional outbox event monitoring. Inspect failed and quarantined domain events with dead-letter queue diagnostics.',
  item: [
    {
      name: 'List failed outbox events',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/outbox?status=FAILED&limit={{limit}}',
        description: 'Lists domain events that exceeded retry limits during asynchronous dispatch.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
    {
      name: 'List quarantined outbox events',
      request: {
        method: 'GET',
        header: jsonHeaders(false),
        url: '{{baseUrl}}/api/v1/workspaces/{{workspaceId}}/outbox?status=QUARANTINED&limit={{limit}}',
        description: 'Lists dead-letter quarantined outbox records requiring manual operator triage.',
      },
      protocolProfileBehavior: { disableCookies: true },
      event: [
        standardTest(200),
      ],
    },
  ],
};

// Assemble new collection folders:
// Keep existing folders 01-12, replace/add 13-19
const baseFolders = col.item.filter(f => {
  const num = parseInt(f.name.slice(0, 2), 10);
  return num >= 1 && num <= 12;
});

const newFolders = [
  initiativesFolder,
  documentsFolder,
  viewsFolder,
  notificationsFolder,
  auditFolder,
  retentionFolder,
  outboxFolder,
];

col.item = [...baseFolders, ...newFolders];

col.info.name = 'Tream API — Complete (M01–M14)';
col.info.description = 'Complete Postman collection for local testing following all mounted API modules in apps/server (M01–M14). Import the accompanying local environment and run ONLY the 01 Smoke folder for an automatic end-to-end run. Other folders (02–19) are comprehensive manual recipes with stateful prerequisites covering Authentication, Workspaces, Memberships, Invitations, Lifecycle, Teams, Projects, Issues, Cycles, Collaboration, Private Files, Initiatives, Documents, Views & Search, Notifications, Audit History, Retention & Trash, and Eventing Outbox.';

// VALIDATE ALL SCRIPTS COMPILE
let totalScripts = 0;
function validateScripts(items, pathStr = '') {
  for (const item of items) {
    const curPath = pathStr ? `${pathStr} / ${item.name}` : item.name;
    if (item.event) {
      for (const ev of item.event) {
        if (ev.script && ev.script.exec) {
          const code = Array.isArray(ev.script.exec) ? ev.script.exec.join('\n') : ev.script.exec;
          try {
            new vm.Script(code);
            totalScripts++;
          } catch (err) {
            console.error(`Syntax error in script at ${curPath} (${ev.listen}):`, err.message);
            throw err;
          }
        }
      }
    }
    if (item.item) {
      validateScripts(item.item, curPath);
    }
  }
}
validateScripts(col.item);
console.log(`Validated ${totalScripts} scripts successfully.`);

// WRITE FILES
fs.writeFileSync(envPath, JSON.stringify(env, null, 2) + '\n', 'utf8');
fs.writeFileSync(colPath, JSON.stringify(col, null, 2) + '\n', 'utf8');
fs.writeFileSync(completeColPath, JSON.stringify(col, null, 2) + '\n', 'utf8');

console.log('Successfully wrote:');
console.log(' - ' + envPath);
console.log(' - ' + colPath);
console.log(' - ' + completeColPath);
console.log(`Collection has ${col.item.length} folders and ${col.item.reduce((acc, f) => acc + (f.item ? f.item.length : 1), 0)} requests.`);
