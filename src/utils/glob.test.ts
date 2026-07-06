import { describe, expect, it } from "vitest";
import { matchesAnyGlob, matchesGlob } from "./glob.js";

describe("matchesGlob", () => {
  it("matches an exact relative path", () => {
    expect(matchesGlob("プロジェクト/メモ.md", "プロジェクト/メモ.md")).toBe(
      true,
    );
    expect(matchesGlob("プロジェクト/メモ.md", "プロジェクト/別.md")).toBe(
      false,
    );
  });

  it("matches * within a single path segment", () => {
    expect(
      matchesGlob(
        "プロジェクト/振り返り 06_29.md",
        "プロジェクト/振り返り*.md",
      ),
    ).toBe(true);
    expect(
      matchesGlob("プロジェクト/サブ/振り返り.md", "プロジェクト/*.md"),
    ).toBe(false);
  });

  it("matches ** across path segments", () => {
    expect(matchesGlob("a/b/c/file.pdf", "a/**/*.pdf")).toBe(true);
    expect(matchesGlob("a/file.pdf", "**/*.pdf")).toBe(true);
  });

  it("matches ? as a single non-separator character", () => {
    expect(matchesGlob("dir/a1.md", "dir/a?.md")).toBe(true);
    expect(matchesGlob("dir/a12.md", "dir/a?.md")).toBe(false);
    expect(matchesGlob("dir/a/b.md", "dir/a?b.md")).toBe(false);
  });

  it("matches against the file name only when the pattern has no slash", () => {
    expect(matchesGlob("プロジェクト/サンプル.csv", "*.csv")).toBe(true);
    expect(matchesGlob("発注書/注文書.pdf", "注文書*")).toBe(true);
    expect(matchesGlob("発注書/注文書.pdf", "*.md")).toBe(false);
  });

  it("treats regex special characters literally", () => {
    expect(matchesGlob("dir/file (1).md", "dir/file (1).md")).toBe(true);
    expect(matchesGlob("dir/fileX1Y.md", "dir/file(1).md")).toBe(false);
    expect(matchesGlob("dir/a.b.md", "dir/a.b.md")).toBe(true);
    expect(matchesGlob("dir/aXb.md", "dir/a.b.md")).toBe(false);
  });
});

describe("matchesAnyGlob", () => {
  it("returns true when any pattern matches", () => {
    expect(matchesAnyGlob("dir/file.csv", ["*.md", "*.csv"])).toBe(true);
  });

  it("returns false when no pattern matches", () => {
    expect(matchesAnyGlob("dir/file.pdf", ["*.md", "*.csv"])).toBe(false);
  });

  it("returns false for an empty pattern list", () => {
    expect(matchesAnyGlob("dir/file.pdf", [])).toBe(false);
  });
});
