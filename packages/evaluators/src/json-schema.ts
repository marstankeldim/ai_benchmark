/**
 * A compact, dependency-free JSON Schema validator covering the subset that
 * structured-output evals actually use: `type`, `properties`, `required`,
 * `items`, `enum`, `const`, numeric bounds, string length, and `additional
 * Properties`. It is intentionally small — a full Ajv is overkill for grading
 * whether a model returned a well-formed object.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

type Schema = Record<string, unknown>;

export function validateJsonSchema(value: unknown, schema: Schema): ValidationResult {
  const errors: string[] = [];
  walk(value, schema, "$", errors);
  return { valid: errors.length === 0, errors };
}

function walk(value: unknown, schema: Schema, path: string, errors: string[]): void {
  if ("const" in schema && !deepEqual(value, schema.const)) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => deepEqual(e, value))) {
    errors.push(`${path}: value not in enum`);
  }

  const type = schema.type as string | string[] | undefined;
  if (type && !matchesType(value, type)) {
    errors.push(`${path}: expected type ${Array.isArray(type) ? type.join("|") : type}`);
    return; // further checks assume the type held
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than ${schema.minLength}`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: string does not match /${schema.pattern}/`);
    }
  }

  if (Array.isArray(value) && schema.items && typeof schema.items === "object") {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], schema.items as Schema, `${path}[${i}]`, errors);
    }
  }

  if (isObject(value)) {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}: missing required "${key}"`);
    }
    const properties = (schema.properties as Record<string, Schema>) ?? {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in value) walk(value[key], propSchema, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
  }
}

function matchesType(value: unknown, type: string | string[]): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => matchesOne(value, t));
}

function matchesOne(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return isObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
