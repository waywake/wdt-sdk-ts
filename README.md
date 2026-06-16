# @waywake/wdt-sdk

TypeScript SDK for 旺店通旗舰版 OpenAPI, built with Bun.

## Install

```bash
bun add @waywake/wdt-sdk
```

## Usage

```ts
import { WdtClient } from "@waywake/wdt-sdk";

const client = new WdtClient({
  sid: process.env.WDT_SID!,
  appKey: process.env.WDT_APP_KEY!,
  appSecret: process.env.WDT_APP_SECRET!,
  baseUrl: process.env.WDT_BASE_URL,
});

const response = await client.call(
  "setting.Warehouse.queryWarehouse",
  {
    startTime: "2020-01-01 00:00:00",
    endTime: "2020-01-20 00:00:00",
  },
  {
    pager: { pageNo: 0, pageSize: 100, calcTotal: true },
  },
);

console.log(response.data?.totalCount);
```

Every public API method from the API list is available as a typed method string and as an `api` helper:

```ts
await client.api.settingWarehouseQueryWarehouse(
  { startTime: "2020-01-01 00:00:00", endTime: "2020-01-20 00:00:00" },
  { pager: { pageNo: 0, pageSize: 100, calcTotal: true } },
);
```

By default, response `data` is typed as `Record<string, unknown>` so TypeScript keeps the SDK response type readable. For strongly typed business data, pass a data type parameter:

```ts
interface VirtualWarehouseQueryData {
  totalCount: number;
  details: Array<{ virtualWarehouseNo: string }>;
}

const response = await client.api.settingStrategyVirtualWarehouseQuery<VirtualWarehouseQueryData>(
  {},
  { pager: { pageNo: 0, pageSize: 100 } },
);

console.log(response.data?.details[0]?.virtualWarehouseNo);
```

Request and response objects use `camelCase` in TypeScript. The SDK converts request keys to `snake_case` before sending and converts response keys back to `camelCase`.

For positional body APIs, pass an array:

```ts
await client.call("wms.stockout.Sales.weighingExt", [
  "xc109393939393939",
  "",
  1.2,
  0,
  false,
]);
```

## Docs

- 接口规范: <https://open.wangdian.cn/qjb/open/guide?path=qjbguide_jkgf>
- Sign算法: <https://open.wangdian.cn/qjb/open/guide?path=qjbguide_signsf>
- API列表: <https://open.wangdian.cn/qjb/open/apidoc>

## Development

```bash
bun install
bun run generate:endpoints
bun test
bun run build
```

Live integration tests are disabled by default. To run them:

```bash
WDT_INTEGRATION=1 \
WDT_BASE_URL='https://example.com/openapi' \
WDT_SID='your-sid' \
WDT_APP_KEY='your-app-key' \
WDT_APP_SECRET='...' \
bun test
```
