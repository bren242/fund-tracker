/**
 * Server-side file path helpers for per-client data isolation.
 *
 * Directory structure:
 *   /data/{clientKey}/funds.json
 *   /data/{clientKey}/brand.json
 *   /data/{clientKey}/backups/
 *   /public/branding/{clientKey}/logo-light.png
 *   /public/branding/{clientKey}/logo-dark.png
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();

/** Ensure a directory exists, create recursively if not */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** /data/{clientKey}/ — base data folder for a client */
export function clientDataDir(clientKey: string): string {
  const dir = path.join(ROOT, "data", clientKey);
  ensureDir(dir);
  return dir;
}

/** /data/{clientKey}/funds.json */
export function fundsPath(clientKey: string): string {
  return path.join(clientDataDir(clientKey), "funds.json");
}

/** /data/{clientKey}/brand.json */
export function brandPath(clientKey: string): string {
  return path.join(clientDataDir(clientKey), "brand.json");
}

/** /data/{clientKey}/backups/ */
export function backupsDir(clientKey: string): string {
  const dir = path.join(clientDataDir(clientKey), "backups");
  ensureDir(dir);
  return dir;
}

/** /data/{clientKey}/parse-drafts.json */
export function parseDraftsPath(clientKey: string): string {
  return path.join(clientDataDir(clientKey), "parse-drafts.json");
}

/** /data/{clientKey}/parse-log.json */
export function parseLogPath(clientKey: string): string {
  return path.join(clientDataDir(clientKey), "parse-log.json");
}

/** /public/branding/{clientKey}/ — logo upload folder */
export function logoUploadDir(clientKey: string): string {
  const dir = path.join(ROOT, "public", "branding", clientKey);
  ensureDir(dir);
  return dir;
}
