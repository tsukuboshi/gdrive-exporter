import { describe, expect, it } from "vitest";
import { parseFolderId, sanitizeFileName } from "./common.js";

describe("parseFolderId", () => {
  it("returns a raw folder ID as-is", () => {
    expect(parseFolderId("1AbC_dEf-2gHiJkLmNoPqRsTuVwXyZ34")).toBe(
      "1AbC_dEf-2gHiJkLmNoPqRsTuVwXyZ34",
    );
  });

  it("extracts the folder ID from a Google Drive folder URL", () => {
    expect(
      parseFolderId(
        "https://drive.google.com/drive/folders/1AbC_dEf-2gHiJkLmNoPqRsTuVwXyZ34",
      ),
    ).toBe("1AbC_dEf-2gHiJkLmNoPqRsTuVwXyZ34");
  });

  it("ignores query parameters like resourcekey", () => {
    expect(
      parseFolderId(
        "https://drive.google.com/drive/folders/1AbC_dEf-2gHiJkLmNoPqRsTuVwXyZ34?resourcekey=0-abc&usp=sharing",
      ),
    ).toBe("1AbC_dEf-2gHiJkLmNoPqRsTuVwXyZ34");
  });

  it("extracts the folder ID from a shared drive URL with u/0 path", () => {
    expect(
      parseFolderId(
        "https://drive.google.com/drive/u/0/folders/1AbC_dEf-2gHiJkLmNoPqRsTuVwXyZ34",
      ),
    ).toBe("1AbC_dEf-2gHiJkLmNoPqRsTuVwXyZ34");
  });

  it("throws on an unrecognizable input", () => {
    expect(() => parseFolderId("https://example.com/foo")).toThrow();
    expect(() => parseFolderId("")).toThrow();
  });
});

describe("sanitizeFileName", () => {
  it("keeps a normal file name unchanged", () => {
    expect(sanitizeFileName("議事録 2026-07-06.md")).toBe(
      "議事録 2026-07-06.md",
    );
  });

  it("replaces Windows-invalid characters with underscores", () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j')).toBe(
      "a_b_c_d_e_f_g_h_i_j",
    );
  });

  it("removes control characters", () => {
    expect(sanitizeFileName("abc\u0000\u001fdef")).toBe("abcdef");
  });

  it("trims leading and trailing dots and spaces", () => {
    expect(sanitizeFileName("  ..report..  ")).toBe("report");
  });

  it("truncates names longer than 200 characters", () => {
    const longName = "あ".repeat(300);
    expect(sanitizeFileName(longName)).toHaveLength(200);
  });

  it("falls back to _unnamed when everything is stripped", () => {
    expect(sanitizeFileName("...")).toBe("_unnamed");
    expect(sanitizeFileName("")).toBe("_unnamed");
  });
});
