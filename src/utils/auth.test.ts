import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREDENTIALS_ENV_VAR,
  parseClientCredentials,
  readClientCredentials,
} from "./auth.js";

const envCredentialsJson = JSON.stringify({
  installed: { client_id: "env-id", client_secret: "env-secret" },
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseClientCredentials", () => {
  it("parses the installed (desktop app) format", () => {
    expect(parseClientCredentials(envCredentialsJson, "test")).toEqual({
      clientId: "env-id",
      clientSecret: "env-secret",
    });
  });

  it("parses the web format", () => {
    const raw = JSON.stringify({
      web: { client_id: "web-id", client_secret: "web-secret" },
    });
    expect(parseClientCredentials(raw, "test")).toEqual({
      clientId: "web-id",
      clientSecret: "web-secret",
    });
  });

  it("rejects invalid JSON", () => {
    expect(() => parseClientCredentials("{oops", "test")).toThrow(
      "Invalid JSON in test",
    );
  });

  it("rejects JSON without client credentials", () => {
    expect(() => parseClientCredentials("{}", "test")).toThrow(
      "Unrecognized credentials format in test",
    );
    expect(() =>
      parseClientCredentials('{"installed":{"client_id":"id"}}', "test"),
    ).toThrow("Unrecognized credentials format in test");
  });
});

describe("readClientCredentials", () => {
  it("uses GCP_CREDENTIALS_JSON when set", async () => {
    vi.stubEnv(CREDENTIALS_ENV_VAR, envCredentialsJson);
    await expect(readClientCredentials()).resolves.toEqual({
      clientId: "env-id",
      clientSecret: "env-secret",
    });
  });

  it("falls back to file search when GCP_CREDENTIALS_JSON is empty", async () => {
    vi.stubEnv(CREDENTIALS_ENV_VAR, "");
    const path = await writeCredentialsFile("file-id", "file-secret");
    vi.stubEnv("GDRIVE_CREDENTIALS_PATH", path);
    await expect(readClientCredentials()).resolves.toEqual({
      clientId: "file-id",
      clientSecret: "file-secret",
    });
  });

  it("falls back to file search when GCP_CREDENTIALS_JSON is whitespace-only", async () => {
    vi.stubEnv(CREDENTIALS_ENV_VAR, " \n");
    const path = await writeCredentialsFile("file-id", "file-secret");
    vi.stubEnv("GDRIVE_CREDENTIALS_PATH", path);
    await expect(readClientCredentials()).resolves.toEqual({
      clientId: "file-id",
      clientSecret: "file-secret",
    });
  });

  it("reads GDRIVE_CREDENTIALS_PATH lazily so .env values are honored", async () => {
    // The var is stubbed after module load; a module-level snapshot would miss it.
    const path = await writeCredentialsFile("lazy-id", "lazy-secret");
    vi.stubEnv("GDRIVE_CREDENTIALS_PATH", path);
    await expect(readClientCredentials()).resolves.toEqual({
      clientId: "lazy-id",
      clientSecret: "lazy-secret",
    });
  });

  it("explains that GCP_CREDENTIALS_JSON must hold JSON content, not a path", async () => {
    vi.stubEnv(CREDENTIALS_ENV_VAR, "./credentials.json");
    await expect(readClientCredentials()).rejects.toThrow(
      "must contain the JSON content of credentials.json, not a file path",
    );
  });

  it("does not echo fragments of a malformed GCP_CREDENTIALS_JSON value", async () => {
    // V8 SyntaxError messages quote the input around the error position;
    // a mis-quoted value must not leak the secret into the error message.
    vi.stubEnv(
      CREDENTIALS_ENV_VAR,
      '{"installed":{"client_secret":GOCSPX-TopSecret}}',
    );
    const error = await readClientCredentials().then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toContain(`Invalid JSON in ${CREDENTIALS_ENV_VAR}`);
    expect(error?.message).not.toContain("GOCSPX");
  });

  it("prefers an explicit --credentials path over the env var", async () => {
    vi.stubEnv(CREDENTIALS_ENV_VAR, envCredentialsJson);
    const path = await writeCredentialsFile("file-id", "file-secret");
    await expect(readClientCredentials(path)).resolves.toEqual({
      clientId: "file-id",
      clientSecret: "file-secret",
    });
  });
});

async function writeCredentialsFile(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gdrive-exporter-test-"));
  const path = join(dir, "credentials.json");
  await writeFile(
    path,
    JSON.stringify({
      installed: { client_id: clientId, client_secret: clientSecret },
    }),
  );
  return path;
}
