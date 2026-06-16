import { describe, expect, test } from "bun:test";
import { createRequestBody, signWdtRequest } from "../src";

describe("signWdtRequest", () => {
  test("matches the official Sign algorithm example", () => {
    const signed = signWdtRequest({
      sid: "wdterp30",
      appKey: "czhc",
      appSecret: "693f9fed686bfe13441385da98b436b6:dd488d0802b1e431e4c72cd355847853",
      method: "wms.stockout.Sales.weighingExt",
      timestamp: 232623153,
      body: '["xc109393939393939","",1.2,0,false]',
    });

    expect(signed.sign).toBe("20f557aaf9190797c581bbceeb6d5a5c");
    expect(signed.query).toEqual({
      key: "czhc",
      method: "wms.stockout.Sales.weighingExt",
      salt: "dd488d0802b1e431e4c72cd355847853",
      sid: "wdterp30",
      timestamp: "232623153",
      v: "1.0",
      sign: "20f557aaf9190797c581bbceeb6d5a5c",
    });
  });

  test("includes pager parameters in the signature", () => {
    const signed = signWdtRequest({
      sid: "seller-sid",
      appKey: "app-key",
      appSecret: "secret:salt",
      method: "setting.Warehouse.queryWarehouse",
      timestamp: 448900499,
      body: '[{"start_time":"2020-01-01 00:00:00","end_time":"2020-01-20 00:00:00"}]',
      pageNo: 0,
      pageSize: 100,
      calcTotal: true,
    });

    expect(signed.query.page_no).toBe("0");
    expect(signed.query.page_size).toBe("100");
    expect(signed.query.calc_total).toBe("1");
    expect(signed.signString).toContain("calc_total1");
    expect(signed.signString).toContain("page_no0");
    expect(signed.signString).toContain("page_size100");
  });
});

describe("createRequestBody", () => {
  test("wraps object requests and converts keys to snake_case", () => {
    expect(createRequestBody({ startTime: "2020-01-01 00:00:00", nestedValue: { warehouseNo: "WH001" } })).toBe(
      '[{"start_time":"2020-01-01 00:00:00","nested_value":{"warehouse_no":"WH001"}}]',
    );
  });

  test("keeps array requests as positional JSON bodies", () => {
    expect(createRequestBody(["xc109393939393939", "", 1.2, 0, false])).toBe(
      '["xc109393939393939","",1.2,0,false]',
    );
  });
});
