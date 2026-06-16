import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const API_LIST_URL = "https://open.wangdian.cn/qjb/open/apidoc";
const DOC_BASE_URL = "https://open.wangdian.cn/qjb/open/apidoc/doc?path=";
const MAX_CONCURRENT_DOC_FETCHES = 8;

interface EndpointRow {
  method: string;
  category: string;
  name: string;
  description: string;
  clientPath: string;
  docUrl: string;
}

interface FieldMeta {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface EndpointSchema {
  requestFields: FieldMeta[];
  dataFields: FieldMeta[];
  childTables: Map<string, FieldMeta[]>;
}

interface TypeShape {
  name: string;
  fields: FieldMeta[];
}

interface EndpointTypeRender {
  requestType: string;
  dataType: string;
  declarations: string[];
}

type DocToken =
  | { kind: "text"; text: string }
  | { kind: "table"; rows: string[][] };

const html = await fetchText(API_LIST_URL);
const endpoints = parseEndpointRows(html);

if (endpoints.length === 0) {
  throw new Error("No WDT endpoints were parsed from the API document.");
}

const schemas = await mapConcurrent(endpoints, MAX_CONCURRENT_DOC_FETCHES, async (endpoint) => {
  const detailHtml = await fetchText(endpoint.docUrl);
  return [endpoint.method, parseEndpointSchema(detailHtml)] as const;
});
const schemaByMethod = new Map<string, EndpointSchema>(schemas);

const endpointTypesByMethod = new Map<string, EndpointTypeRender>();
for (const endpoint of endpoints) {
  endpointTypesByMethod.set(endpoint.method, renderEndpointTypes(endpoint.method, schemaByMethod.get(endpoint.method)));
}

writeGeneratedFile("../src/endpoint-types.ts", renderEndpointTypesFile(endpointTypesByMethod));
writeGeneratedFile("../src/endpoints.ts", renderEndpointsFile(endpoints, endpointTypesByMethod));

console.log(`Generated ${endpoints.length} endpoints at src/endpoints.ts and src/endpoint-types.ts`);

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

function writeGeneratedFile(relativePath: string, contents: string): void {
  const outputPath = resolve(import.meta.dir, relativePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, contents);
}

function parseEndpointRows(source: string): EndpointRow[] {
  const rows: EndpointRow[] = [];
  const categoryRegex = /<div mname="([^"]+)">([\s\S]*?)(?=<div mname=|<\/div>\s*<\/div>\s*<\/div>)/g;
  let categoryMatch: RegExpExecArray | null;

  while ((categoryMatch = categoryRegex.exec(source))) {
    const category = decodeHtml(categoryMatch[1]).trim();
    const section = categoryMatch[2];
    const rowRegex =
      /<tr><td><a href="apidoc\/doc\?path=([^"]+)">([^<]+)<\/a><\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(section))) {
      const method = decodeHtml(rowMatch[1]).trim();
      rows.push({
        method,
        category,
        name: cleanCell(rowMatch[3]),
        description: cleanCell(rowMatch[4]),
        clientPath: cleanCell(rowMatch[5]),
        docUrl: `${DOC_BASE_URL}${encodeURIComponent(method)}`,
      });
    }
  }

  return dedupeByMethod(rows);
}

function parseEndpointSchema(source: string): EndpointSchema {
  const tokens = parseDocTokens(source);
  const requestTables = collectNamedTables(tokens, findTextIndex(tokens, /^3\.3\s*业务请求参数/), /^4\./);
  const responseTables = collectNamedTables(tokens, findTextIndex(tokens, /^4\./), /^5\./);

  const requestFields =
    requestTables.get("params") ??
    requestTables.get("detail_list") ??
    requestTables.get("details") ??
    tableWithoutTransportFields(requestTables.get("__root") ?? []);
  const rootDataFields = responseTables.get("data") ?? inferDataFieldsFromResponseExample(tokens);
  const childTables = new Map(responseTables);

  childTables.delete("__root");
  childTables.delete("data");

  return {
    requestFields: sanitizeFields(requestFields),
    dataFields: sanitizeFields(rootDataFields),
    childTables,
  };
}

function parseDocTokens(source: string): DocToken[] {
  const tokens: DocToken[] = [];
  const tokenRegex = /<table[\s\S]*?<\/table>|<p[\s\S]*?<\/p>|<h\d[\s\S]*?<\/h\d>/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(source))) {
    const raw = match[0];
    if (/^<table/i.test(raw)) {
      const rows = parseTable(raw);
      if (rows.length > 0) {
        tokens.push({ kind: "table", rows });
      }
    } else {
      const text = cleanCell(raw);
      if (text) {
        tokens.push({ kind: "text", text });
      }
    }
  }

  return tokens;
}

function parseTable(source: string): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(source))) {
    const cells: string[] = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      cells.push(cleanCell(cellMatch[1]).replace(/\n/g, ""));
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

function collectNamedTables(tokens: DocToken[], startIndex: number, stopPattern: RegExp): Map<string, FieldMeta[]> {
  const tables = new Map<string, FieldMeta[]>();
  if (startIndex < 0) {
    return tables;
  }

  let pendingName = "__root";

  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === "text") {
      if (stopPattern.test(token.text)) {
        break;
      }
      const name = normalizeTableName(token.text);
      if (name) {
        pendingName = name;
      }
      continue;
    }

    const fields = rowsToFields(token.rows);
    if (fields.length > 0) {
      tables.set(pendingName, fields);
      pendingName = "__root";
    }
  }

  return tables;
}

function findTextIndex(tokens: DocToken[], pattern: RegExp): number {
  return tokens.findIndex((token) => token.kind === "text" && pattern.test(token.text));
}

function rowsToFields(rows: string[][]): FieldMeta[] {
  if (rows.length < 2) {
    return [];
  }

  const header = rows[0].map((cell) => cell.trim());
  const fieldIndex = findHeaderIndex(header, "字段");
  const typeIndex = findHeaderIndex(header, "类型");
  const requiredIndex = findHeaderIndex(header, "必须");
  const descriptionIndex = findHeaderIndex(header, "描述");

  if (fieldIndex < 0) {
    return [];
  }

  return rows
    .slice(1)
    .map((row) => ({
      name: normalizeFieldName(row[fieldIndex] ?? ""),
      type: row[typeIndex] ?? "",
      required: /是|必填|required/i.test(row[requiredIndex] ?? ""),
      description: row[descriptionIndex] ?? "",
    }))
    .filter((field) => field.name.length > 0 && !isTransportField(field.name));
}

function findHeaderIndex(header: string[], name: string): number {
  return header.findIndex((cell) => cell.includes(name));
}

function normalizeTableName(text: string): string | undefined {
  const normalized = normalizeFieldName(text.replace(/^\d+(\.\d+)*\s*/, ""));
  if (!normalized || normalized.length > 80) {
    return undefined;
  }
  if (/^(json|php|java|c#|curl|常用工具|返回值为|正常响应示例|异常响应示例)$/i.test(normalized)) {
    return undefined;
  }
  if (/mapstringobject|listmapstringobject|返回值/.test(normalized.toLowerCase())) {
    return undefined;
  }
  return normalized;
}

function normalizeFieldName(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/[^\w]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function tableWithoutTransportFields(fields: FieldMeta[]): FieldMeta[] {
  return fields.filter((field) => !["pager", "page_no", "page_size", "calc_total"].includes(field.name));
}

function isTransportField(name: string): boolean {
  return ["sid", "key", "salt", "method", "v", "timestamp", "sign", "pager"].includes(name);
}

function sanitizeFields(fields: FieldMeta[]): FieldMeta[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.name)) {
      return false;
    }
    seen.add(field.name);
    return true;
  });
}

function inferDataFieldsFromResponseExample(tokens: DocToken[]): FieldMeta[] {
  const exampleToken = tokens.find(
    (token) => token.kind === "table" && token.rows.some((row) => /JSON/i.test(row[0] ?? "") && /\{/.test(row[1] ?? "")),
  );
  if (!exampleToken || exampleToken.kind !== "table") {
    return [];
  }

  const jsonText = exampleToken.rows.find((row) => /JSON/i.test(row[0] ?? "") && /\{/.test(row[1] ?? ""))?.[1];
  if (!jsonText) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText) as { data?: unknown };
    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return [];
    }

    return Object.entries(parsed.data as Record<string, unknown>).map(([name, value]) => ({
      name,
      type: inferDocType(value),
      required: false,
      description: "",
    }));
  } catch {
    return [];
  }
}

function inferDocType(value: unknown): string {
  if (Array.isArray(value)) {
    return "List";
  }
  if (typeof value === "number") {
    return "Int";
  }
  if (typeof value === "boolean") {
    return "Boolean";
  }
  if (typeof value === "string") {
    return "String";
  }
  if (value && typeof value === "object") {
    return "Map<String, Object>";
  }
  return "Object";
}

function renderEndpointTypes(method: string, schema: EndpointSchema | undefined): EndpointTypeRender {
  const baseName = `Wdt${toPascalCase(method)}`;
  const declarations: string[] = [];
  const requestType = `${baseName}Request`;
  const dataType = `${baseName}Data`;

  const requestFields = schema?.requestFields ?? [];
  const dataFields = schema?.dataFields ?? [];
  const childTables = schema?.childTables ?? new Map<string, FieldMeta[]>();
  const shapes = new Map<string, TypeShape>();

  for (const [tableName, childFields] of childTables) {
    if (childFields.length > 0) {
      shapes.set(tableName, {
        name: `${baseName}${toPascalCase(tableName)}Item`,
        fields: sanitizeFields(childFields),
      });
    }
  }

  for (const shape of shapes.values()) {
    declarations.push(renderInterface(shape.name, shape.fields, shapes));
  }

  declarations.push(
    requestFields.length > 0
      ? renderInterface(requestType, requestFields, new Map(), "WdtRequestObject")
      : `export type ${requestType} = WdtRequestBody;`,
  );
  declarations.push(
    dataFields.length > 0
      ? renderInterface(dataType, dataFields, shapes)
      : `export type ${dataType} = WdtResponseData;`,
  );

  return { requestType, dataType, declarations };
}

function renderInterface(
  name: string,
  fields: FieldMeta[],
  childShapes: Map<string, TypeShape>,
  baseType = "WdtResponseData",
): string {
  const lines = fields.map((field) => {
    const propertyName = toCamelCase(field.name);
    const optional = field.required ? "" : "?";
    const doc = field.description ? `  /** ${escapeComment(field.description)} */\n` : "";
    const type = renderTsType(field, childShapes.get(field.name)?.name);
    return `${doc}  ${quotePropertyIfNeeded(propertyName)}${optional}: ${type};`;
  });

  return `export interface ${name} extends ${baseType} {\n${lines.join("\n")}\n}`;
}

function renderTsType(field: FieldMeta, childTypeName: string | undefined): string {
  const docType = field.type.toLowerCase().replace(/\s+/g, "");
  if (childTypeName) {
    return /list|array/.test(docType) ? `${childTypeName}[]` : childTypeName;
  }
  if (/list|array|\[\]/.test(docType)) {
    return "unknown[]";
  }
  if (/bool/.test(docType)) {
    return "boolean";
  }
  if (/int|long|float|double|decimal|number|byte|金额|价格|数量/.test(docType)) {
    return "number";
  }
  if (/map|object|json/.test(docType)) {
    return "Record<string, unknown>";
  }
  if (/date|time|string|char|text|varchar/.test(docType)) {
    return "string";
  }
  return "unknown";
}

function renderEndpointTypesFile(typesByMethod: Map<string, EndpointTypeRender>): string {
  const declarations = Array.from(typesByMethod.values()).flatMap((item) => item.declarations);
  return `/* eslint-disable */\n// This file is generated by scripts/generate-endpoints.ts.\n// Source: ${API_LIST_URL}\n\nimport type { WdtRequestBody, WdtRequestObject, WdtResponseData } from "./types";\n\n${declarations.join("\n\n")}\n`;
}

function renderEndpointsFile(rows: EndpointRow[], typesByMethod: Map<string, EndpointTypeRender>): string {
  const entries = rows.map((row) => `  ${JSON.stringify(row.method)}: ${JSON.stringify(row)},`).join("\n");
  const contracts = rows
    .map((row) => {
      const endpointTypes = typesByMethod.get(row.method);
      return `  ${JSON.stringify(row.method)}: { request: EndpointTypes.${endpointTypes?.requestType ?? "WdtUnknownRequest"}; response: WdtApiResponse<EndpointTypes.${endpointTypes?.dataType ?? "WdtUnknownData"}> };`;
    })
    .join("\n");

  return `/* eslint-disable */\n// This file is generated by scripts/generate-endpoints.ts.\n// Source: ${API_LIST_URL}\n\nimport type * as EndpointTypes from "./endpoint-types";\nimport type { WdtApiResponse, WdtEndpointMeta } from "./types";\n\nexport const WDT_ENDPOINTS = {\n${entries}\n} as const satisfies Record<string, WdtEndpointMeta>;\n\nexport type WdtMethod = keyof typeof WDT_ENDPOINTS;\n\nexport interface WdtEndpointMap {\n${contracts}\n}\n`;
}

function cleanCell(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .replace(/[ \t\r\f\v]+/g, " "),
  ).trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function dedupeByMethod(rows: EndpointRow[]): EndpointRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.method)) {
      return false;
    }
    seen.add(row.method);
    return true;
  });
}

function toCamelCase(key: string): string {
  return key.replace(/_+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase());
}

function toPascalCase(value: string): string {
  return value
    .split(/[._\W]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

function quotePropertyIfNeeded(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function escapeComment(value: string): string {
  return value.replace(/\*\//g, "* /").replace(/\s+/g, " ");
}
