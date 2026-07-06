import { Command } from "commander";
import { authenticate } from "../utils/auth.js";

export function authCommand(): Command {
  return new Command("auth")
    .description("Authenticate with Google Drive (OAuth2 browser flow)")
    .option(
      "--credentials <path>",
      "path to credentials.json (default: $GDRIVE_CREDENTIALS_PATH, ./credentials.json, or ~/.local/share/gdrive-exporter/credentials.json)",
    )
    .action(async (options: { credentials?: string }) => {
      await authenticate(options.credentials);
    });
}
