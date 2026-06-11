import { join } from 'node:path';

export interface ServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  exportDir: string;
  dbPath: string;
}

export function loadConfig(): ServiceConfig {
  const dataDir = process.env.HERMES_DATA_DIR ?? './storage';
  return {
    host: process.env.HERMES_SERVICE_HOST ?? '127.0.0.1',
    port: Number(process.env.HERMES_SERVICE_PORT ?? 17891),
    dataDir,
    exportDir: process.env.HERMES_EXPORT_DIR ?? './exports',
    dbPath: join(dataDir, 'hermes.sqlite'),
  };
}
