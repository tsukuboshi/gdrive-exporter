import { describe, expect, it, vi } from "vitest";
import { executeExportTasks } from "./downloader.js";

const silentLogger = {
  progress: () => {},
  skip: () => {},
  warn: () => {},
};

function makeTask(
  label: string,
  execute = vi.fn().mockResolvedValue(undefined),
) {
  return { label, localPath: `/out/${label}`, execute };
}

describe("executeExportTasks", () => {
  it("executes all tasks and reports success counts", async () => {
    const tasks = [makeTask("a.md"), makeTask("b.md")];
    const summary = await executeExportTasks(tasks, {
      force: false,
      concurrency: 2,
      fileExists: async () => false,
      logger: silentLogger,
    });
    expect(summary).toMatchObject({
      total: 2,
      succeeded: 2,
      skipped: 0,
      failed: 0,
    });
    for (const task of tasks) {
      expect(task.execute).toHaveBeenCalledTimes(1);
    }
  });

  it("skips existing files unless force is set", async () => {
    const task = makeTask("a.md");
    const summary = await executeExportTasks([task], {
      force: false,
      concurrency: 1,
      fileExists: async () => true,
      logger: silentLogger,
    });
    expect(summary).toMatchObject({
      total: 1,
      succeeded: 0,
      skipped: 1,
      failed: 0,
    });
    expect(task.execute).not.toHaveBeenCalled();
  });

  it("overwrites existing files when force is set", async () => {
    const task = makeTask("a.md");
    const summary = await executeExportTasks([task], {
      force: true,
      concurrency: 1,
      fileExists: async () => true,
      logger: silentLogger,
    });
    expect(summary).toMatchObject({ succeeded: 1, skipped: 0 });
    expect(task.execute).toHaveBeenCalledTimes(1);
  });

  it("continues after a failure and records it in the summary", async () => {
    const failing = makeTask(
      "bad.md",
      vi.fn().mockRejectedValue(new Error("403 Forbidden")),
    );
    const ok = makeTask("good.md");
    const summary = await executeExportTasks([failing, ok], {
      force: false,
      concurrency: 1,
      fileExists: async () => false,
      logger: silentLogger,
    });
    expect(summary).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(summary.failures).toEqual([
      { label: "bad.md", error: "403 Forbidden" },
    ]);
    expect(ok.execute).toHaveBeenCalledTimes(1);
  });

  it("limits concurrent executions to the configured concurrency", async () => {
    let running = 0;
    let maxRunning = 0;
    const slowExecute = () =>
      new Promise<void>((resolve) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        setTimeout(() => {
          running--;
          resolve();
        }, 10);
      });
    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask(`${i}.md`, vi.fn(slowExecute)),
    );
    await executeExportTasks(tasks, {
      force: false,
      concurrency: 2,
      fileExists: async () => false,
      logger: silentLogger,
    });
    expect(maxRunning).toBeLessThanOrEqual(2);
  });
});
