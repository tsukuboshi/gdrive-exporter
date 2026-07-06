import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { Auth, google } from "googleapis";
import open from "open";
import { errorMessage } from "./common.js";
import { stripControlChars } from "./log.js";

const CONFIG_DIR = join(homedir(), ".gdrive-exporter");
export const TOKEN_PATH = join(CONFIG_DIR, "token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

/** Env var holding the full credentials.json content (e.g. via .env). */
export const CREDENTIALS_ENV_VAR = "GCP_CREDENTIALS_JSON";

const CREDENTIALS_GUIDANCE =
  "Create an OAuth client (Desktop app) in Google Cloud Console and download its JSON, " +
  `or set ${CREDENTIALS_ENV_VAR} (e.g. in .env) to the JSON content.`;

/**
 * Searched in order when neither --credentials nor the env var is given.
 * process.env is read lazily so values loaded from .env in main() are seen
 * (module evaluation happens before dotenv runs).
 */
function credentialsCandidates(): string[] {
  return [
    process.env.GDRIVE_CREDENTIALS_PATH,
    "./credentials.json",
    join(homedir(), ".local/share/gdrive-exporter/credentials.json"),
  ].filter((path): path is string => path != null && path !== "");
}

async function resolveCredentialsPath(explicitPath?: string): Promise<string> {
  if (explicitPath) {
    return explicitPath;
  }
  const candidates = credentialsCandidates();
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(
    `credentials.json not found. Searched: ${candidates.join(", ")}. ${CREDENTIALS_GUIDANCE}`,
  );
}

interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

interface OAuthClientKey {
  client_id?: string;
  client_secret?: string;
}

/** Extracts the OAuth client id/secret from credentials.json content. */
export function parseClientCredentials(
  raw: string,
  source: string,
  options: { redactParseError?: boolean } = {},
): ClientCredentials {
  let parsed: { installed?: OAuthClientKey; web?: OAuthClientKey };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // V8 SyntaxError messages quote a fragment of the input; redact them for
    // env values so a mis-quoted secret cannot leak into terminal or CI logs.
    const detail = options.redactParseError ? "" : `: ${errorMessage(error)}`;
    throw new Error(`Invalid JSON in ${source}${detail}`);
  }
  const key = parsed.installed ?? parsed.web;
  if (!key?.client_id || !key.client_secret) {
    throw new Error(`Unrecognized credentials format in ${source}`);
  }
  return { clientId: key.client_id, clientSecret: key.client_secret };
}

export async function readClientCredentials(
  explicitPath?: string,
): Promise<ClientCredentials> {
  // --credentials beats the env var; the env var beats the file search.
  const envJson = process.env[CREDENTIALS_ENV_VAR]?.trim();
  if (!explicitPath && envJson) {
    let credentials: ClientCredentials;
    try {
      credentials = parseClientCredentials(envJson, CREDENTIALS_ENV_VAR, {
        redactParseError: true,
      });
    } catch (error) {
      throw new Error(
        `${errorMessage(error)}. ${CREDENTIALS_ENV_VAR} must contain the ` +
          "JSON content of credentials.json, not a file path.",
      );
    }
    console.log(`Using credentials: ${CREDENTIALS_ENV_VAR} (env)`);
    return credentials;
  }

  const credentialsPath = await resolveCredentialsPath(explicitPath);
  let raw: string;
  try {
    raw = await readFile(credentialsPath, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read credentials at ${credentialsPath} ` +
        `(${errorMessage(error)}). ${CREDENTIALS_GUIDANCE}`,
    );
  }
  const credentials = parseClientCredentials(raw, credentialsPath);
  console.log(`Using credentials: ${credentialsPath}`);
  return credentials;
}

async function saveToken(tokens: Auth.Credentials): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/** Runs the interactive OAuth2 browser flow and saves the token for later runs. */
export async function authenticate(credentialsPath?: string): Promise<void> {
  const { clientId, clientSecret } =
    await readClientCredentials(credentialsPath);

  // The state parameter ties the callback to this run so another local
  // process cannot inject its own authorization code (session fixation).
  const state = randomBytes(16).toString("hex");

  const server = createServer();
  const codePromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Authentication timed out after 5 minutes"));
    }, AUTH_TIMEOUT_MS);
    server.on("request", (req, res) => {
      // Only pathname/searchParams are read, so the URL base is irrelevant.
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/callback") {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (url.searchParams.get("state") !== state) {
        res.statusCode = 400;
        res.end("Invalid state parameter.");
        return;
      }
      clearTimeout(timer);
      const code = url.searchParams.get("code");
      if (code) {
        res.end("Authentication successful! You can close this tab.");
        resolve(code);
      } else {
        res.end("Authentication failed. Check the terminal for details.");
        const reason = stripControlChars(
          url.searchParams.get("error") ?? "no code returned",
        );
        reject(new Error(`OAuth error: ${reason}`));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const redirectUri = `http://localhost:${port}/callback`;
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // PKCE: recommended for installed apps, whose client_secret is not secret.
  const codes = await client.generateCodeVerifierAsync();
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    // Force a refresh_token to be issued even on re-authentication.
    prompt: "consent",
    state,
    code_challenge_method: Auth.CodeChallengeMethod.S256,
    code_challenge: codes.codeChallenge,
  });

  console.log("Opening browser for authentication...");
  console.log(`If the browser does not open, visit:\n${authUrl}\n`);
  await open(authUrl);

  try {
    const code = await codePromise;
    const { tokens } = await client.getToken({
      code,
      codeVerifier: codes.codeVerifier,
      redirect_uri: redirectUri,
    });
    await saveToken(tokens);
    console.log(`Authentication successful. Token saved to ${TOKEN_PATH}`);
  } finally {
    server.close();
  }
}

/** Returns an OAuth2 client restored from the saved token (auto-refreshing). */
export async function loadAuthorizedClient(
  credentialsPath?: string,
): Promise<Auth.OAuth2Client> {
  const { clientId, clientSecret } =
    await readClientCredentials(credentialsPath);
  const client = new google.auth.OAuth2(clientId, clientSecret);

  let tokens: Auth.Credentials;
  try {
    tokens = JSON.parse(await readFile(TOKEN_PATH, "utf8")) as Auth.Credentials;
  } catch {
    throw new Error(
      `No saved token found at ${TOKEN_PATH}. Run "gdrive-exporter auth" first.`,
    );
  }
  client.setCredentials(tokens);
  client.on("tokens", (refreshed) => {
    void saveToken({ ...tokens, ...refreshed });
  });
  return client;
}
