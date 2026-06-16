import type { WdtApiResponse } from "./types";

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
