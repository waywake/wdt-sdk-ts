import { describe, expect, test } from "bun:test";
import { WDT_ENDPOINTS, WdtApiError, WdtClient, aliasForMethod, type WdtApiResponse, type WdtResponseData } from "../src";

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
    expect(response).toEqual({
      status: 0,
      data: {
        totalCount: 1,
        details: [{ warehouseNo: "WH001", isDisabled: false }],
      },
    });
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

  test("keeps generated api response types readable and supports typed data", async () => {
    interface VirtualWarehouseQueryData extends WdtResponseData {
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
              details: [{ virtual_warehouse_no: "VW001" }],
            },
          }),
        ),
    });

    const defaultResponse: WdtApiResponse = await client.api.settingStrategyVirtualWarehouseQuery(
      {},
      { pager: { pageNo: 0, pageSize: 100 } },
    );
    expect(defaultResponse.status).toBe(0);

    const typedResponse = await client.api.settingStrategyVirtualWarehouseQuery<VirtualWarehouseQueryData>(
      {},
      { pager: { pageNo: 0, pageSize: 100 } },
    );
    const totalCount: number | undefined = typedResponse.data?.totalCount;
    const firstWarehouseNo: string | undefined = typedResponse.data?.details[0]?.virtualWarehouseNo;

    expect(totalCount).toBe(1);
    expect(firstWarehouseNo).toBe("VW001");
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
