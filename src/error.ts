import type { WdtApiResponse } from "./types";

export interface WdtResponseErrorOptions {
  url: string;
  status: number;
  statusText: string;
  contentType: string | null;
  body: string;
}

export class WdtApiError extends Error {
  readonly response: WdtApiResponse;
  readonly status: number;

  constructor(response: WdtApiResponse) {
    super(response.message ?? `WDT API request failed with status ${response.status}.`);
    this.name = "WdtApiError";
    this.response = response;
    this.status = response.status;
  }
}

export class WdtHttpError extends Error {
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly contentType: string | null;
  readonly body: string;

  constructor(options: WdtResponseErrorOptions) {
    super(
      `WDT HTTP request failed with ${options.status} ${options.statusText || "Unknown Status"}: ${formatBodyExcerpt(
        options.body,
      )}`,
    );
    this.name = "WdtHttpError";
    this.url = options.url;
    this.status = options.status;
    this.statusText = options.statusText;
    this.contentType = options.contentType;
    this.body = options.body;
  }
}

export class WdtResponseParseError extends Error {
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly contentType: string | null;
  readonly body: string;
  override readonly cause: unknown;

  constructor(options: WdtResponseErrorOptions & { cause: unknown }) {
    super(
      `WDT response was not valid JSON (${options.status} ${options.statusText || "Unknown Status"}${
        options.contentType ? `, ${options.contentType}` : ""
      }): ${formatBodyExcerpt(options.body)}`,
      { cause: options.cause },
    );
    this.name = "WdtResponseParseError";
    this.url = options.url;
    this.status = options.status;
    this.statusText = options.statusText;
    this.contentType = options.contentType;
    this.body = options.body;
    this.cause = options.cause;
  }
}

function formatBodyExcerpt(body: string, maxLength = 500): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
