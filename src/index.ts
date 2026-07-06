import { Command } from "commander";
import { config as loadDotenv } from "dotenv";
import { allCommand } from "./commands/all.js";
import { authCommand } from "./commands/auth.js";
import { docsCommand } from "./commands/docs.js";
import { sheetsCommand } from "./commands/sheets.js";
import { slidesCommand } from "./commands/slides.js";
import { errorMessage } from "./utils/common.js";

export async function main(): Promise<void> {
  // Values already set in the environment take precedence over .env entries.
  loadDotenv({ quiet: true });

  const program = new Command();
  program
    .name("gdrive-exporter")
    .description(
      "Export Google Drive files: Docs to Markdown, Sheets to CSV, Slides to PDF, others as-is",
    )
    .version("0.1.0");

  program.addCommand(authCommand());
  program.addCommand(docsCommand());
  program.addCommand(sheetsCommand());
  program.addCommand(slidesCommand());
  program.addCommand(allCommand());

  try {
    await program.parseAsync();
  } catch (error) {
    console.error(`Error: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}
