import { createRequestBody } from "./body";
import { keysToCamelCase } from "./case";
import { WDT_ENDPOINTS, type WdtEndpointMap, type WdtMethod } from "./endpoints";
import { WdtApiError } from "./error";
import { signWdtRequest, type WdtSignedRequest } from "./sign";
import type {
  DeepCamel,
  JsonValue,
  WdtApiResponse,
  WdtCallOptions,
  WdtClientOptions,
  WdtEndpointMeta,
  WdtFetch,
  WdtRequestBody,
} from "./types";

const PRODUCTION_BASE_URL = "https://wdt.wangdian.cn/openapi";

type PascalSegment<S extends string> = Capitalize<Uncapitalize<S>>;
type PascalDotted<S extends string> = S extends `${infer Head}.${infer Tail}`
  ? `${PascalSegment<Head>}${PascalDotted<Tail>}`
  : PascalSegment<S>;

export type WdtMethodAlias<S extends string> = S extends `${infer Head}.${infer Tail}`
  ? `${Uncapitalize<Head>}${PascalDotted<Tail>}`
  : Uncapitalize<S>;

export type WdtApiHelpers = {
  [M in WdtMethod as WdtMethodAlias<M>]: (
    request?: WdtEndpointMap[M]["request"],
    options?: WdtCallOptions,
  ) => Promise<DeepCamel<WdtEndpointMap[M]["response"]>>;
};

export interface PreparedWdtRequest {
  url: string;
  init: RequestInit;
  signed: WdtSignedRequest;
}

export class WdtClient {
  readonly sid: string;
  readonly appKey: string;
  readonly appSecret: string;
  readonly baseUrl: string;
  readonly version: string;
  readonly api: WdtApiHelpers;

  private readonly fetchImpl: WdtFetch;
  private readonly defaultThrowOnApiError: boolean;
  private readonly timestampProvider?: () => number;

  constructor(options: WdtClientOptions) {
    this.sid = options.sid;
    this.appKey = options.appKey;
    this.appSecret = options.appSecret;
    this.baseUrl = options.baseUrl ?? PRODUCTION_BASE_URL;
    this.version = options.version ?? "1.0";
    this.fetchImpl = options.fetch ?? fetch;
    this.defaultThrowOnApiError = options.throwOnApiError ?? false;
    this.timestampProvider = options.timestampProvider;
    this.api = createApiHelpers(this);
  }

  call<M extends WdtMethod>(
    method: M,
    request?: WdtEndpointMap[M]["request"],
    options?: WdtCallOptions,
  ): Promise<DeepCamel<WdtEndpointMap[M]["response"]>>;
  call(method: string, request?: WdtRequestBody, options?: WdtCallOptions): Promise<WdtApiResponse>;
  async call(method: string, request?: WdtRequestBody, options: WdtCallOptions = {}): Promise<WdtApiResponse> {
    const prepared = this.prepareRequest(method, request, options);
    const response = await this.fetchImpl(prepared.url, prepared.init);
    const text = await response.text();
    const parsed = parseJsonResponse(text);
    const camelResponse = keysToCamelCase(parsed) as WdtApiResponse;

    if (!response.ok) {
      throw new Error(`WDT HTTP request failed with ${response.status} ${response.statusText}: ${text}`);
    }

    const shouldThrow = options.throwOnApiError ?? this.defaultThrowOnApiError;
    if (shouldThrow && typeof camelResponse.status === "number" && camelResponse.status !== 0) {
      throw new WdtApiError(camelResponse);
    }

    return camelResponse;
  }

  prepareRequest(method: string, request?: WdtRequestBody, options: WdtCallOptions = {}): PreparedWdtRequest {
    const body = createRequestBody(request);
    const signed = signWdtRequest({
      sid: this.sid,
      appKey: this.appKey,
      appSecret: this.appSecret,
      method,
      body,
      version: this.version,
      timestamp: options.timestamp ?? this.timestampProvider?.(),
      pageNo: options.pager?.pageNo,
      pageSize: options.pager?.pageSize,
      calcTotal: options.pager?.calcTotal,
    });
    const url = new URL(this.baseUrl);

    for (const [key, value] of Object.entries(signed.query)) {
      url.searchParams.set(key, value);
    }

    return {
      url: url.toString(),
      signed,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: signed.body,
        signal: options.signal,
      },
    };
  }

  getEndpoint(method: WdtMethod): WdtEndpointMeta {
    return WDT_ENDPOINTS[method];
  }
}

export function createWdtClient(options: WdtClientOptions): WdtClient {
  return new WdtClient(options);
}

function createApiHelpers(client: WdtClient): WdtApiHelpers {
  const helpers: Record<string, (request?: WdtRequestBody, options?: WdtCallOptions) => Promise<WdtApiResponse>> = {};

  for (const method of Object.keys(WDT_ENDPOINTS)) {
    helpers[aliasForMethod(method)] = (request, options) => client.call(method, request, options);
  }

  return helpers as WdtApiHelpers;
}

export function aliasForMethod(method: string): string {
  return method
    .split(".")
    .map((segment, index) => {
      const normalized = segment.charAt(0).toLowerCase() + segment.slice(1);
      return index === 0 ? normalized : normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

function parseJsonResponse(text: string): JsonValue {
  if (text.trim().length === 0) {
    return { status: 0 };
  }

  const parsed = JSON.parse(text) as JsonValue;
  return parsed;
}
