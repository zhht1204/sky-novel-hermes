import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HermesDatabaseOptions, StorageBackend } from '@sky-novel-hermes/storage';

export interface ServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  exportDir: string;
  settingsPath: string;
  storage: HermesDatabaseOptions;
}

export interface AppSettings {
  storage: HermesDatabaseOptions;
  exportDir: string;
}

export function loadConfig(): ServiceConfig {
  const dataDir = process.env.HERMES_DATA_DIR ?? './storage';
  const settingsPath = join(dataDir, 'settings.json');
  const settings = loadSettings(settingsPath, dataDir);
  return {
    host: process.env.HERMES_SERVICE_HOST ?? '127.0.0.1',
    port: Number(process.env.HERMES_SERVICE_PORT ?? 17891),
    dataDir,
    exportDir: settings.exportDir,
    settingsPath,
    storage: settings.storage,
  };
}

export function loadSettings(settingsPath: string, dataDir = './storage'): AppSettings {
  const saved = readSettingsFile(settingsPath);
  const envBackend = parseBackend(process.env.HERMES_STORAGE_BACKEND);
  const envPostgresUrl = process.env.HERMES_DATABASE_URL ?? process.env.DATABASE_URL;
  const backend = envBackend ?? saved.storage?.backend ?? (envPostgresUrl ? 'postgres' : 'sqlite');

  return {
    exportDir: process.env.HERMES_EXPORT_DIR ?? saved.exportDir ?? './exports',
    storage: {
      backend,
      sqlitePath: process.env.HERMES_SQLITE_PATH ?? saved.storage?.sqlitePath ?? join(dataDir, 'hermes.sqlite'),
      postgresUrl: envPostgresUrl ?? saved.storage?.postgresUrl ?? '',
    },
  };
}

export function saveSettings(settingsPath: string, settings: AppSettings): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function readSettingsFile(settingsPath: string): Partial<AppSettings> {
  if (!existsSync(settingsPath)) return {};
  return JSON.parse(readFileSync(settingsPath, 'utf8')) as Partial<AppSettings>;
}

function parseBackend(value: string | undefined): StorageBackend | undefined {
  return value === 'sqlite' || value === 'postgres' ? value : undefined;
}
