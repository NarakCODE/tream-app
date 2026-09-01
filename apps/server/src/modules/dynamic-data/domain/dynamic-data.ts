export const FIELD_TYPES = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'CURRENCY',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'URL',
  'SELECT',
  'MULTI_SELECT',
  'STATUS',
  'USER',
  'RELATION',
  'CREATED_AT',
  'UPDATED_AT',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface DynamicDatabase {
  id: string;
  workspaceId: string;
  name: string;
  icon: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface FieldDefinition {
  id: string;
  databaseId: string;
  name: string;
  key: string;
  type: FieldType;
  isRequired: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface DynamicRecord {
  id: string;
  databaseId: string;
  workspaceId: string;
  values: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export type DynamicDataRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
export const canWriteDynamicData = (role: DynamicDataRole): boolean =>
  role !== 'GUEST';
