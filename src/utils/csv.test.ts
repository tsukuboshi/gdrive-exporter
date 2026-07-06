import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.js";

describe("toCsv", () => {
  it("joins rows with commas and newlines", () => {
    expect(
      toCsv([
        ["name", "age"],
        ["Alice", "30"],
      ]),
    ).toBe("name,age\nAlice,30\n");
  });

  it("quotes fields containing commas", () => {
    expect(toCsv([["a,b", "c"]])).toBe('"a,b",c\n');
  });

  it("doubles internal quotes and wraps the field", () => {
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""\n');
  });

  it("quotes fields containing newlines", () => {
    expect(toCsv([["line1\nline2", "x"]])).toBe('"line1\nline2",x\n');
  });

  it("pads short rows to a uniform column count", () => {
    expect(toCsv([["a", "b", "c"], ["1"]])).toBe("a,b,c\n1,,\n");
  });

  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});
