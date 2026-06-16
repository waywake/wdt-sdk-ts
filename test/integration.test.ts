import { expect, test } from "bun:test";
import { WdtClient } from "../src";

const integrationTest = process.env.WDT_INTEGRATION === "1" ? test : test.skip;

integrationTest("queries warehouses in a configured WDT environment", async () => {
  const sid = requiredEnv("WDT_SID");
  const appKey = requiredEnv("WDT_APP_KEY");
  const appSecret = requiredEnv("WDT_APP_SECRET");
  const baseUrl = requiredEnv("WDT_BASE_URL");

  const client = new WdtClient({
    sid,
    appKey,
    appSecret,
    baseUrl,
    throwOnApiError: true,
  });

  const response = await client.api.settingWarehouseQueryWarehouse(
    {
      startTime: "2020-01-01 00:00:00",
      endTime: "2020-01-20 00:00:00",
    },
    { pager: { pageNo: 0, pageSize: 100, calcTotal: true } },
  );

  expect(response.status).toBe(0);
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when WDT_INTEGRATION=1.`);
  }
  return value;
}
