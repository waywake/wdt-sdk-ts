import { keysToSnakeCase } from "./case";
import type { WdtRequestBody } from "./types";

export function createRequestBody(input: WdtRequestBody): string {
  if (input === undefined) {
    return "[]";
  }

  const snakeInput = keysToSnakeCase(input);
  const body = Array.isArray(snakeInput) ? snakeInput : [snakeInput];

  return JSON.stringify(body);
}
