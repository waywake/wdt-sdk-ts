import { createHash } from "node:crypto";

export const WDT_EPOCH_SECONDS = 1_325_347_200;

export interface WdtSecretParts {
  secret: string;
  salt: string;
}

export interface WdtSignInput {
  sid: string;
  appKey: string;
  appSecret: string;
  method: string;
  body: string;
  timestamp?: number;
  version?: string;
  pageNo?: number;
  pageSize?: number;
  calcTotal?: boolean | 0 | 1;
}

export interface WdtSignedRequest {
  body: string;
  sign: string;
  signString: string;
  query: Record<string, string>;
  timestamp: number;
}

export function parseAppSecret(appSecret: string): WdtSecretParts {
  const separatorIndex = appSecret.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === appSecret.length - 1) {
    throw new Error("WDT appSecret must be in the form '<secret>:<salt>'.");
  }

  return {
    secret: appSecret.slice(0, separatorIndex),
    salt: appSecret.slice(separatorIndex + 1),
  };
}

export function getWdtTimestamp(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000) - WDT_EPOCH_SECONDS;
}

export function signWdtRequest(input: WdtSignInput): WdtSignedRequest {
  const { secret, salt } = parseAppSecret(input.appSecret);
  const timestamp = input.timestamp ?? getWdtTimestamp();
  const version = input.version ?? "1.0";
  const signParams: Record<string, string> = {
    body: input.body,
    key: input.appKey,
    method: input.method,
    salt,
    sid: input.sid,
    timestamp: String(timestamp),
    v: version,
  };

  if (input.pageNo !== undefined) {
    signParams.page_no = String(input.pageNo);
  }
  if (input.pageSize !== undefined) {
    signParams.page_size = String(input.pageSize);
  }
  if (input.calcTotal !== undefined) {
    signParams.calc_total = normalizeCalcTotal(input.calcTotal);
  }

  const signString = `${secret}${Object.keys(signParams)
    .sort()
    .map((key) => `${key}${signParams[key]}`)
    .join("")}${secret}`;

  const sign = createHash("md5").update(signString, "utf8").digest("hex");
  const { body: _body, ...queryWithoutBody } = signParams;

  return {
    body: input.body,
    sign,
    signString,
    query: {
      ...queryWithoutBody,
      sign,
    },
    timestamp,
  };
}

export function normalizeCalcTotal(value: boolean | 0 | 1): string {
  return value === true || value === 1 ? "1" : "0";
}
