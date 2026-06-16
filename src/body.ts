import { keysToSnakeCase } from "./case";
import type { JsonValue, WdtRequestBody } from "./types";

export function createRequestBody(input: WdtRequestBody): string {
  if (input === undefined) {
    return "[]";
  }

  const snakeInput = keysToSnakeCase(input) as JsonValue;
  const body = Array.isArray(snakeInput) ? snakeInput : [snakeInput];

  return JSON.stringify(body);
}
