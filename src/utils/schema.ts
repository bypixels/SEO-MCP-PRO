/**
 * Schema utilities for converting Zod schemas to JSON Schema
 */

import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema format for MCP
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return parseZodType(schema);
}

function parseZodType(schema: z.ZodTypeAny): Record<string, unknown> {
  const typeName = schema._def.typeName;

  switch (typeName) {
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodTypeAny;
        properties[key] = parseZodType(fieldSchema);

        // Check if the field is required (not optional and not with default)
        if (!fieldSchema.isOptional() && !fieldSchema._def.defaultValue) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    case 'ZodString': {
      const result: Record<string, unknown> = { type: 'string' };
      const stringSchema = schema as z.ZodString;
      const checks = stringSchema._def.checks || [];

      for (const check of checks) {
        switch (check.kind) {
          case 'min':
            result.minLength = check.value;
            break;
          case 'max':
            result.maxLength = check.value;
            break;
          case 'email':
            result.format = 'email';
            break;
          case 'url':
            result.format = 'uri';
            break;
          case 'regex':
            result.pattern = check.regex.source;
            break;
        }
      }

      if (schema._def.description) {
        result.description = schema._def.description;
      }

      return result;
    }

    case 'ZodNumber': {
      const result: Record<string, unknown> = { type: 'number' };
      const numberSchema = schema as z.ZodNumber;
      const checks = numberSchema._def.checks || [];

      for (const check of checks) {
        switch (check.kind) {
          case 'min':
            result.minimum = check.value;
            break;
          case 'max':
            result.maximum = check.value;
            break;
          case 'int':
            result.type = 'integer';
            break;
        }
      }

      if (schema._def.description) {
        result.description = schema._def.description;
      }

      return result;
    }

    case 'ZodBoolean': {
      const result: Record<string, unknown> = { type: 'boolean' };
      if (schema._def.description) {
        result.description = schema._def.description;
      }
      return result;
    }

    case 'ZodArray': {
      const arraySchema = schema as z.ZodArray<z.ZodTypeAny>;
      const result: Record<string, unknown> = {
        type: 'array',
        items: parseZodType(arraySchema._def.type),
      };

      if (arraySchema._def.minLength) {
        result.minItems = arraySchema._def.minLength.value;
      }
      if (arraySchema._def.maxLength) {
        result.maxItems = arraySchema._def.maxLength.value;
      }
      if (schema._def.description) {
        result.description = schema._def.description;
      }

      return result;
    }

    case 'ZodEnum': {
      const enumSchema = schema as z.ZodEnum<[string, ...string[]]>;
      const result: Record<string, unknown> = {
        type: 'string',
        enum: enumSchema._def.values,
      };
      if (schema._def.description) {
        result.description = schema._def.description;
      }
      return result;
    }

    case 'ZodOptional': {
      const optionalSchema = schema as z.ZodOptional<z.ZodTypeAny>;
      return parseZodType(optionalSchema._def.innerType);
    }

    case 'ZodDefault': {
      const defaultSchema = schema as z.ZodDefault<z.ZodTypeAny>;
      const inner = parseZodType(defaultSchema._def.innerType);
      inner.default = defaultSchema._def.defaultValue();
      return inner;
    }

    case 'ZodNullable': {
      const nullableSchema = schema as z.ZodNullable<z.ZodTypeAny>;
      const inner = parseZodType(nullableSchema._def.innerType);
      inner.nullable = true;
      return inner;
    }

    case 'ZodUnion': {
      const unionSchema = schema as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>;
      return {
        oneOf: unionSchema._def.options.map(parseZodType),
      };
    }

    case 'ZodLiteral': {
      const literalSchema = schema as z.ZodLiteral<unknown>;
      const value = literalSchema._def.value;
      const result: Record<string, unknown> = {
        type: typeof value as string,
        const: value,
      };
      if (schema._def.description) {
        result.description = schema._def.description;
      }
      return result;
    }

    case 'ZodRecord': {
      const recordSchema = schema as z.ZodRecord<z.ZodTypeAny>;
      const result: Record<string, unknown> = {
        type: 'object',
        additionalProperties: parseZodType(recordSchema._def.valueType),
      };
      if (schema._def.description) {
        result.description = schema._def.description;
      }
      return result;
    }

    case 'ZodIntersection': {
      const intersectionSchema = schema as z.ZodIntersection<z.ZodTypeAny, z.ZodTypeAny>;
      const left = parseZodType(intersectionSchema._def.left);
      const right = parseZodType(intersectionSchema._def.right);
      return { allOf: [left, right] };
    }

    case 'ZodDiscriminatedUnion': {
      const duSchema = schema as z.ZodDiscriminatedUnion<string, z.ZodDiscriminatedUnionOption<string>[]>;
      const result: Record<string, unknown> = {
        oneOf: duSchema._def.options.map(parseZodType),
      };
      if (schema._def.description) {
        result.description = schema._def.description;
      }
      return result;
    }

    case 'ZodTuple': {
      const tupleSchema = schema as z.ZodTuple;
      const result: Record<string, unknown> = {
        type: 'array',
        items: tupleSchema._def.items.map((item: z.ZodTypeAny) => parseZodType(item)),
        minItems: tupleSchema._def.items.length,
        maxItems: tupleSchema._def.items.length,
      };
      if (schema._def.description) {
        result.description = schema._def.description;
      }
      return result;
    }

    default: {
      // Fallback for unknown types
      const result: Record<string, unknown> = {};
      if (schema._def.description) {
        result.description = schema._def.description;
      }
      return result;
    }
  }
}
