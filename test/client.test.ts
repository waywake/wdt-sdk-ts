import { describe, expect, test } from "bun:test";
import { WDT_ENDPOINTS, WdtApiError, WdtClient, WdtHttpError, WdtResponseParseError, aliasForMethod } from "../src";

describe("WdtClient", () => {
  test("prepares signed requests with camelCase input converted to snake_case", () => {
    const client = new WdtClient({
      sid: "seller-sid",
      appKey: "app-key",
      appSecret: "secret:salt",
      timestampProvider: () => 448900499,
    });

    const prepared = client.prepareRequest(
      "setting.Warehouse.queryWarehouse",
      { startTime: "2020-01-01 00:00:00", endTime: "2020-01-20 00:00:00" },
      { pager: { pageNo: 0, pageSize: 100, calcTotal: true } },
    );
    const url = new URL(prepared.url);

    expect(prepared.init.method).toBe("POST");
    expect(prepared.init.body).toBe('[{"start_time":"2020-01-01 00:00:00","end_time":"2020-01-20 00:00:00"}]');
    expect(url.searchParams.get("key")).toBe("app-key");
    expect(url.searchParams.get("method")).toBe("setting.Warehouse.queryWarehouse");
    expect(url.searchParams.get("page_no")).toBe("0");
    expect(url.searchParams.get("page_size")).toBe("100");
    expect(url.searchParams.get("calc_total")).toBe("1");
    expect(url.searchParams.get("sign")).toMatch(/^[a-f0-9]{32}$/);
  });

  test("calls fetch and converts response keys to camelCase", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = new WdtClient({
      sid: "seller-sid",
      appKey: "app-key",
      appSecret: "secret:salt",
      timestampProvider: () => 448900499,
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            status: 0,
            data: {
              total_count: 1,
              details: [{ warehouse_no: "WH001", is_disabled: false }],
            },
          }),
        );
      },
    });

    const response = await client.call(
      "setting.Warehouse.queryWarehouse",
      { startTime: "2020-01-01 00:00:00", endTime: "2020-01-20 00:00:00" },
      { pager: { pageNo: 0, pageSize: 100, calcTotal: true } },
    );

    expect(requests).toHaveLength(1);
    expect(response.status).toBe(0);
    expect(response.data?.totalCount).toBe(1);
    expect(response.data?.details[0]?.warehouseNo).toBe("WH001");
    expect(response.data?.details[0]?.isDisabled).toBe(false);
  });

  test("provides api helper aliases for generated endpoints", async () => {
    const client = new WdtClient({
      sid: "seller-sid",
      appKey: "app-key",
      appSecret: "secret:salt",
      timestampProvider: () => 448900499,
      fetch: async () => new Response(JSON.stringify({ status: 0, data: { total_count: 0 } })),
    });

    const response = await client.api.settingWarehouseQueryWarehouse(
      { startTime: "2020-01-01 00:00:00", endTime: "2020-01-20 00:00:00" },
      { pager: { pageNo: 0, pageSize: 100 } },
    );

    expect(response.status).toBe(0);
    expect((response.data as { totalCount?: number } | undefined)?.totalCount).toBe(0);
    expect(aliasForMethod("wms.stockout.Sales.queryWithDetail")).toBe("wmsStockoutSalesQueryWithDetail");
  });

  test("returns generated endpoint response types and supports typed data overrides", async () => {
    interface VirtualWarehouseQueryData {
      totalCount: number;
      details: Array<{ virtualWarehouseNo: string }>;
    }

    const client = new WdtClient({
      sid: "seller-sid",
      appKey: "app-key",
      appSecret: "secret:salt",
      timestampProvider: () => 448900499,
      fetch: async () =>
        new Response(
          JSON.stringify({
            status: 0,
            data: {
              total_count: 1,
              detail_list: [
                {
                  virtual_warehouse_no: "VW001",
                  virtual_warehouse_id: 10,
                  name: "Virtual Warehouse",
                  sys_warehouse_list: [{ warehouse_no: "WH001", warehouse_name: "Warehouse", warehouse_id: 20 }],
                  shop_list: [{ shop_no: "SHOP001", shop_name: "Shop", shop_id: 30 }],
                },
              ],
            },
          }),
        ),
    });

    const defaultResponse = await client.api.settingStrategyVirtualWarehouseQuery(
      {},
      { pager: { pageNo: 0, pageSize: 100 } },
    );
    const generatedWarehouseNo: string | undefined =
      defaultResponse.data?.detailList[0]?.sysWarehouseList?.[0]?.warehouseNo;

    expect(defaultResponse.status).toBe(0);
    expect(defaultResponse.data?.totalCount).toBe(1);
    expect(generatedWarehouseNo).toBe("WH001");

    const typedResponse = await client.api.settingStrategyVirtualWarehouseQuery<VirtualWarehouseQueryData>(
      {},
      { pager: { pageNo: 0, pageSize: 100 } },
    );
    const totalCount: number | undefined = typedResponse.data?.totalCount;

    expect(totalCount).toBe(1);
  });

  test("throws WdtApiError when throwOnApiError is enabled", async () => {
    const client = new WdtClient({
      sid: "seller-sid",
      appKey: "app-key",
      appSecret: "secret:salt",
      throwOnApiError: true,
      fetch: async () => new Response(JSON.stringify({ status: 100, message: "参数错误" })),
    });

    await expect(client.call("setting.Warehouse.queryWarehouse", {})).rejects.toBeInstanceOf(WdtApiError);
  });

  test("throws WdtHttpError with response body for non-2xx HTML responses", async () => {
    const client = new WdtClient({
      sid: "seller-sid",
      appKey: "app-key",
      appSecret: "secret:salt",
      fetch: async () =>
        new Response("<html><body>Bad gateway</body></html>", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    });

    await expect(client.call("setting.strategy.VirtualWarehouse.stockSearch", {})).rejects.toMatchObject({
      name: "WdtHttpError",
      status: 502,
      contentType: "text/html; charset=utf-8",
      body: "<html><body>Bad gateway</body></html>",
    });
  });

  test("throws WdtResponseParseError for 2xx non-JSON responses", async () => {
    const client = new WdtClient({
      sid: "seller-sid",
      appKey: "app-key",
      appSecret: "secret:salt",
      fetch: async () =>
        new Response("<html><body>Login page</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });

    await expect(client.call("setting.strategy.VirtualWarehouse.stockSearch", {})).rejects.toBeInstanceOf(
      WdtResponseParseError,
    );
  });
});

describe("generated endpoint registry", () => {
  test("contains all interfaces parsed from the official API list", () => {
    expect(Object.keys(WDT_ENDPOINTS)).toHaveLength(184);
    expect(WDT_ENDPOINTS["setting.Warehouse.queryWarehouse"].docUrl).toContain(
      "setting.Warehouse.queryWarehouse",
    );
    expect(WDT_ENDPOINTS["wms.stockout.Sales.queryWithDetail"].category).toBe("订单类");
  });
});
