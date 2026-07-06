import { type Auth, type docs_v1, google } from "googleapis";
import { withRetry } from "./retry.js";

export interface DocTab {
  tabId: string;
  title: string;
}

const docsClients = new WeakMap<Auth.OAuth2Client, docs_v1.Docs>();

function docsFor(auth: Auth.OAuth2Client): docs_v1.Docs {
  let docs = docsClients.get(auth);
  if (!docs) {
    docs = google.docs({ version: "v1", auth });
    docsClients.set(auth, docs);
  }
  return docs;
}

/** Lists the top-level tabs of a document (empty array for tab-less docs). */
export async function listTabs(
  auth: Auth.OAuth2Client,
  documentId: string,
): Promise<DocTab[]> {
  const docs = docsFor(auth);
  const res = await withRetry(() =>
    docs.documents.get({
      documentId,
      includeTabsContent: true,
      fields: "tabs(tabProperties(tabId,title))",
    }),
  );
  return (res.data.tabs ?? []).flatMap((tab) => {
    const tabId = tab.tabProperties?.tabId;
    return tabId ? [{ tabId, title: tab.tabProperties?.title ?? "" }] : [];
  });
}

/**
 * Exports a single document tab as Markdown via the docs.google.com export
 * endpoint. The `tab` query parameter is undocumented (shown in
 * https://dev.to/googleworkspace/exporting-individual-tabs-from-google-docs-as-pdfs-2903)
 * and may stop working — callers must be prepared to fall back to files.export.
 */
export async function exportTabAsMarkdown(
  auth: Auth.OAuth2Client,
  fileId: string,
  tabId: string,
): Promise<string> {
  const url = `https://docs.google.com/document/d/${fileId}/export?format=markdown&tab=${encodeURIComponent(tabId)}`;
  const res = await withRetry(() =>
    auth.request<string>({ url, responseType: "text" }),
  );
  return res.data;
}
