export type WdtEnvironment = "production";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}
export type JsonArray = JsonValue[];

export interface WdtRequestObject {
  [key: string]: unknown;
}
export type WdtRequestBody = WdtRequestObject | readonly unknown[] | undefined;
export interface WdtResponseData {
  [key: string]: unknown;
}
export type WdtFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface WdtClientOptions {
  sid: string;
  appKey: string;
  appSecret: string;
  environment?: WdtEnvironment;
  baseUrl?: string;
  version?: string;
  fetch?: WdtFetch;
  throwOnApiError?: boolean;
  timestampProvider?: () => number;
}

export interface WdtPagerOptions {
  pageNo: number;
  pageSize: number;
  calcTotal?: boolean | 0 | 1;
}

export interface WdtCallOptions {
  pager?: WdtPagerOptions;
  timestamp?: number;
  signal?: AbortSignal;
  headers?: HeadersInit;
  throwOnApiError?: boolean;
}

export interface WdtEndpointMeta {
  method: string;
  category: string;
  name: string;
  description: string;
  clientPath: string;
  docUrl: string;
}

export interface WdtSuccessResponse<TData extends object = WdtResponseData> {
  status: 0;
  message?: string;
  data?: TData;
  [key: string]: unknown;
}

export interface WdtErrorResponse {
  status: number;
  message?: string;
  [key: string]: unknown;
}

export interface WdtApiResponse<TData extends object = WdtResponseData> {
  status: number;
  message?: string;
  data?: TData;
  [key: string]: unknown;
}

export type WdtEndpointContract = {
  request: WdtRequestBody;
  response: WdtApiResponse;
};

export type WdtEndpointContracts = Record<string, WdtEndpointContract>;

export type SnakeToCamel<S extends string> =
  S extends `${infer Head}_${infer Tail}`
    ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
    : S;

export type CamelToSnake<S extends string> = S extends `${infer Head}${infer Tail}`
  ? Tail extends Uncapitalize<Tail>
    ? `${Lowercase<Head>}${CamelToSnake<Tail>}`
    : `${Lowercase<Head>}_${CamelToSnake<Tail>}`
  : S;

export type DeepCamel<T> = T extends readonly [infer First, ...infer Rest]
  ? readonly [DeepCamel<First>, ...DeepCamel<Rest>]
  : T extends readonly (infer Item)[]
    ? DeepCamel<Item>[]
    : T extends object
      ? {
          [K in keyof T as K extends string ? SnakeToCamel<K> : K]: DeepCamel<T[K]>;
        }
      : T;

export type DeepSnake<T> = T extends readonly [infer First, ...infer Rest]
  ? readonly [DeepSnake<First>, ...DeepSnake<Rest>]
  : T extends readonly (infer Item)[]
    ? DeepSnake<Item>[]
    : T extends object
      ? {
          [K in keyof T as K extends string ? CamelToSnake<K> : K]: DeepSnake<T[K]>;
        }
      : T;
