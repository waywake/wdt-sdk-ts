import { describe, expect, test } from "bun:test";
import { keysToCamelCase, keysToSnakeCase, toCamelCase, toSnakeCase } from "../src";

describe("case conversion", () => {
  test("converts individual keys", () => {
    expect(toSnakeCase("warehouseNo")).toBe("warehouse_no");
    expect(toSnakeCase("apiGoodsId")).toBe("api_goods_id");
    expect(toCamelCase("total_count")).toBe("totalCount");
  });

  test("converts nested objects and arrays", () => {
    expect(
      keysToCamelCase({
        total_count: 1,
        details: [{ warehouse_no: "WH001", is_disabled: false }],
      }),
    ).toEqual({
      totalCount: 1,
      details: [{ warehouseNo: "WH001", isDisabled: false }],
    });

    expect(keysToSnakeCase({ outerList: [{ stockSpecNo: "SKU001" }] })).toEqual({
      outer_list: [{ stock_spec_no: "SKU001" }],
    });
  });
});
