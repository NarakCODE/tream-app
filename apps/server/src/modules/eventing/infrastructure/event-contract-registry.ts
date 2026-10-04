import { Injectable } from '@nestjs/common';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const id = { type: 'string', minLength: 1, maxLength: 128 };
@Injectable()
export class EventContractRegistry {
  private readonly envelopeValidator: ReturnType<Ajv2020['compile']>;
  private readonly validators = new Map<
    string,
    ReturnType<Ajv2020['compile']>
  >();
  private readonly aggregates = new Map<string, string>();
  constructor() {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormats(ajv);
    const schema = JSON.parse(
      readFileSync(join(__dirname, 'contracts/event-v1.schema.json'), 'utf8'),
    ) as Record<string, unknown>;
    ajv.addSchema(schema);
    const { oneOf: _variants, $id: _id, ...envelope } = schema;
    void _variants;
    void _id;
    this.envelopeValidator = ajv.compile(envelope);
    const catalog = JSON.parse(
      readFileSync(join(__dirname, 'contracts/catalog.json'), 'utf8'),
    ) as {
      events: {
        event_type: string;
        schema_version: number;
        aggregate_type: string;
        payload_schema: string;
      }[];
    };
    for (const entry of catalog.events) {
      this.validators.set(
        `${entry.event_type}:${entry.schema_version}`,
        ajv.compile({
          $ref: `https://schemas.tream.example/events/${entry.payload_schema}`,
        }),
      );
      this.aggregates.set(
        `${entry.event_type}:${entry.schema_version}`,
        entry.aggregate_type,
      );
    }
    for (const [event, aggregate, properties, required] of [
      [
        'workspace.updated',
        'workspace',
        { workspace_id: id },
        ['workspace_id'],
      ],
      [
        'workspace.deleted',
        'workspace',
        { workspace_id: id },
        ['workspace_id'],
      ],
      [
        'workspace.preference_updated',
        'membership',
        { workspace_id: id, membership_id: id },
        ['workspace_id', 'membership_id'],
      ],
      ...['created', 'updated', 'left'].map((action) => [
        `membership.${action}`,
        'membership',
        {
          workspace_id: id,
          membership_id: id,
          role: { enum: ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] },
        },
        action === 'left'
          ? ['workspace_id', 'membership_id']
          : ['workspace_id', 'membership_id', 'role'],
      ]),
      ...['created', 'revoked', 'accepted'].map((action) => [
        `invitation.${action}`,
        'invitation',
        {
          workspace_id: id,
          invitation_id: id,
          role: { enum: ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] },
        },
        ['workspace_id', 'invitation_id'],
      ]),
    ] as [string, string, Record<string, unknown>, string[]][]) {
      this.validators.set(
        `${event}:1`,
        ajv.compile({
          type: 'object',
          properties,
          required,
          additionalProperties: false,
        }),
      );
      this.aggregates.set(`${event}:1`, aggregate);
    }
  }
  validateEnvelope(event: Record<string, unknown>): void {
    if (!this.envelopeValidator(event))
      throw new Error('Invalid event envelope');
    this.validate(
      event.event_type as string,
      event.schema_version as number,
      event.aggregate_type as string,
      event.payload as Record<string, unknown>,
    );
    const payload = event.payload as Record<string, unknown>;
    if (
      payload.workspace_id !== undefined &&
      payload.workspace_id !== event.workspace_id
    )
      throw new Error('Event workspace mismatch');
  }

  validate(
    type: string,
    version: number,
    aggregateType: string,
    payload: Record<string, unknown>,
  ): void {
    const validator = this.validators.get(`${type}:${version}`);
    if (
      !validator ||
      this.aggregates.get(`${type}:${version}`) !== aggregateType
    )
      throw new Error('Unknown event contract or aggregate');
    if (!validator(payload))
      throw new Error(
        `Invalid event payload: ${JSON.stringify(validator.errors)}`,
      );
  }
}
