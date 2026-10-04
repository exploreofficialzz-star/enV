/**
 * SERVER ONLY. Small JSON Schema helpers for the subset enV task schemas use.
 *
 * - strictSchemaProblems: is the schema acceptable to providers' strict structured-output modes
 *   (every object closed and fully required, no $ref)?
 * - validateJsonSchema: minimal validator used by tests and the mock provider.
 * - exampleFromSchema: deterministic value that satisfies a schema (mock provider + contract tests).
 */
import type { JsonSchema } from "../../types.ts";

type Schema = { [key: string]: unknown };

function isObject(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typesOf(schema: Schema): string[] {
  const t = schema.type;
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

export function strictSchemaProblems(schema: JsonSchema, path = "$"): string[] {
  const problems: string[] = [];
  if ("$ref" in schema || "$defs" in schema) problems.push(`${path}: $ref/$defs are not allowed`);
  const types = typesOf(schema);
  if (types.length === 0 && !("enum" in schema) && !Array.isArray(schema.anyOf)) problems.push(`${path}: missing type`);
  if (types.includes("object")) {
    const props = isObject(schema.properties) ? schema.properties : null;
    if (!props) problems.push(`${path}: object without properties`);
    if (schema.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
    const required = Array.isArray(schema.required) ? (schema.required as unknown[]) : [];
    for (const key of Object.keys(props ?? {})) {
      if (!required.includes(key)) problems.push(`${path}.${key}: must be listed in required`);
      const child = props?.[key];
      if (isObject(child)) problems.push(...strictSchemaProblems(child, `${path}.${key}`));
    }
  }
  if (types.includes("array")) {
    if (!isObject(schema.items)) problems.push(`${path}: array without items`);
    else problems.push(...strictSchemaProblems(schema.items, `${path}[]`));
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((branch, index) => {
      if (isObject(branch)) problems.push(...strictSchemaProblems(branch, `${path}|${index}`));
    });
  }
  return problems;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    default:
      return false;
  }
}

export function validateJsonSchema(value: unknown, schema: JsonSchema, path = "$"): string[] {
  const problems: string[] = [];
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) problems.push(`${path}: must equal the constant`);
  if (Array.isArray(schema.enum) && !schema.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))) {
    problems.push(`${path}: not one of the allowed values`);
  }
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.filter(isObject);
    if (!branches.some((branch) => validateJsonSchema(value, branch, path).length === 0)) problems.push(`${path}: matches none of the allowed shapes`);
  }
  const types = typesOf(schema);
  if (types.length > 0 && !types.some((t) => matchesType(value, t))) {
    problems.push(`${path}: expected ${types.join(" or ")}`);
    return problems;
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) problems.push(`${path}: shorter than ${schema.minLength}`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) problems.push(`${path}: longer than ${schema.maxLength}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) problems.push(`${path}: below ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) problems.push(`${path}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) problems.push(`${path}: fewer than ${schema.minItems} items`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) problems.push(`${path}: more than ${schema.maxItems} items`);
    if (isObject(schema.items)) value.forEach((item, index) => problems.push(...validateJsonSchema(item, schema.items as JsonSchema, `${path}[${index}]`)));
  }
  if (isObject(value) && !Array.isArray(value)) {
    const props = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const key of required) if (!(key in value)) problems.push(`${path}.${key}: missing`);
    for (const [key, child] of Object.entries(value)) {
      const childSchema = props[key];
      if (isObject(childSchema)) problems.push(...validateJsonSchema(child, childSchema, `${path}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${path}.${key}: unexpected property`);
    }
  }
  return problems;
}

export function exampleFromSchema(schema: JsonSchema): unknown {
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.anyOf)) {
    const first = schema.anyOf.find(isObject);
    if (first) return exampleFromSchema(first);
  }
  const types = typesOf(schema);
  const type = types.find((t) => t !== "null") ?? types[0] ?? "string";
  switch (type) {
    case "object": {
      const props = isObject(schema.properties) ? schema.properties : {};
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(props)) if (isObject(child)) out[key] = exampleFromSchema(child);
      return out;
    }
    case "array": {
      const min = typeof schema.minItems === "number" ? schema.minItems : 1;
      const max = typeof schema.maxItems === "number" ? schema.maxItems : min;
      const count = Math.max(0, Math.min(Math.max(min, 1), max));
      const item = isObject(schema.items) ? exampleFromSchema(schema.items) : "item";
      return Array.from({ length: count }, () => structuredClone(item));
    }
    case "integer":
    case "number": {
      let n = typeof schema.minimum === "number" ? schema.minimum : 0;
      if (typeof schema.maximum === "number" && n > schema.maximum) n = schema.maximum;
      return n;
    }
    case "boolean":
      return false;
    case "null":
      return null;
    default: {
      const min = typeof schema.minLength === "number" ? schema.minLength : 1;
      const max = typeof schema.maxLength === "number" ? schema.maxLength : 40;
      const base = "Example text";
      const text = base.length >= min ? base : base.padEnd(min, "x");
      return text.slice(0, Math.max(1, max));
    }
  }
}
