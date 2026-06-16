import type { DeepCamel, DeepSnake, JsonArray, JsonObject, JsonValue } from "./types";

const plainObjectTag = "[object Object]";

export function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

export function toCamelCase(key: string): string {
  return key.replace(/_+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase());
}

export function isPlainObject(value: unknown): value is JsonObject {
  return Object.prototype.toString.call(value) === plainObjectTag;
}

export function keysToSnakeCase<T extends JsonValue | undefined>(value: T): DeepSnake<T> {
  return convertKeys(value, toSnakeCase) as DeepSnake<T>;
}

export function keysToCamelCase<T extends JsonValue | undefined>(value: T): DeepCamel<T> {
  return convertKeys(value, toCamelCase) as DeepCamel<T>;
}

function convertKeys(value: JsonValue | undefined, convertKey: (key: string) => string): JsonValue | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => convertKeys(item, convertKey)) as JsonArray;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [convertKey(key), convertKeys(entryValue, convertKey)]),
  ) as JsonObject;
}
