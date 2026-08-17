import {
  defaultRoutingConfig,
  normalizeRoutingConfig,
  type RoutingConfig,
} from "./routing-config";

export async function ensureRoutingSettingsTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS routing_settings (
      setting_key TEXT PRIMARY KEY NOT NULL,
      config_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
}

export async function loadRoutingConfig(db: D1Database): Promise<RoutingConfig> {
  await ensureRoutingSettingsTable(db);
  const row = await db
    .prepare("SELECT config_json FROM routing_settings WHERE setting_key = 'creator-routing'")
    .first<{ config_json: string }>();
  if (!row?.config_json) return structuredClone(defaultRoutingConfig);
  try {
    return normalizeRoutingConfig(JSON.parse(row.config_json));
  } catch {
    return structuredClone(defaultRoutingConfig);
  }
}

export async function saveRoutingConfig(
  db: D1Database,
  value: unknown,
): Promise<RoutingConfig> {
  await ensureRoutingSettingsTable(db);
  const config = normalizeRoutingConfig(value);
  await db.prepare(`
    INSERT INTO routing_settings (setting_key, config_json, updated_at)
    VALUES ('creator-routing', ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `).bind(JSON.stringify(config), Date.now()).run();
  return config;
}
