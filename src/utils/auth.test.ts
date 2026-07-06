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

  it("ignores an empty GCP_CREDENTIALS_JSON", async () => {
    vi.stubEnv(CREDENTIALS_ENV_VAR, "");
    const path = await writeCredentialsFile("file-id", "file-secret");
    await expect(readClientCredentials(path)).resolves.toEqual({
      clientId: "file-id",
      clientSecret: "file-secret",
    });
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
