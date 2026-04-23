import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeviceRegistrationRequest, ProbeActionEvent, UrlAuditEvent } from "@ai-maestro-lite/shared";
import { Pool } from "pg";

type StoredRecord<T> = T & {
  id: string;
  synced: boolean;
  createdAt: string;
};

type DbRow<T> = {
  id: string;
  payload: T;
  created_at: Date;
};

interface FileState {
  devices: Array<DeviceRegistrationRequest & { createdAt: string }>;
  probes: Array<StoredRecord<ProbeActionEvent>>;
  audits: Array<StoredRecord<UrlAuditEvent>>;
  bitableRows: Array<{ id: string; kind: "probe" | "audit"; payload: unknown; syncedAt: string }>;
  notifications: Array<{ id: string; level: "info" | "warning" | "error"; title: string; body: string; createdAt: string }>;
}

export interface AppStore {
  init(): Promise<void>;
  registerDevice(payload: DeviceRegistrationRequest): Promise<void>;
  appendProbes(events: ProbeActionEvent[]): Promise<number>;
  appendAudits(events: UrlAuditEvent[]): Promise<number>;
  getUnsynced(limit: number): Promise<{ probes: Array<StoredRecord<ProbeActionEvent>>; audits: Array<StoredRecord<UrlAuditEvent>> }>;
  markSynced(kind: "probe" | "audit", ids: string[]): Promise<void>;
  appendBitableRows(rows: Array<{ kind: "probe" | "audit"; payload: unknown }>): Promise<void>;
  appendNotification(level: "info" | "warning" | "error", title: string, body: string): Promise<void>;
}

class FileStore implements AppStore {
  private readonly filePath = path.join(process.cwd(), "data", "app-store.json");

  async init(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await readFile(this.filePath, "utf8");
    } catch {
      await this.writeState({
        devices: [],
        probes: [],
        audits: [],
        bitableRows: [],
        notifications: []
      });
    }
  }

  async registerDevice(payload: DeviceRegistrationRequest): Promise<void> {
    const state = await this.readState();
    state.devices = state.devices.filter((device) => device.deviceId !== payload.deviceId);
    state.devices.push({ ...payload, createdAt: new Date().toISOString() });
    await this.writeState(state);
  }

  async appendProbes(events: ProbeActionEvent[]): Promise<number> {
    const state = await this.readState();
    const now = new Date().toISOString();
    const stored = events.map((event) => ({
      ...event,
      id: randomUUID(),
      synced: false,
      createdAt: now
    }));
    state.probes.push(...stored);
    await this.writeState(state);
    return stored.length;
  }

  async appendAudits(events: UrlAuditEvent[]): Promise<number> {
    const state = await this.readState();
    const now = new Date().toISOString();
    const stored = events.map((event) => ({
      ...event,
      id: randomUUID(),
      synced: false,
      createdAt: now
    }));
    state.audits.push(...stored);
    await this.writeState(state);
    return stored.length;
  }

  async getUnsynced(limit: number): Promise<{ probes: Array<StoredRecord<ProbeActionEvent>>; audits: Array<StoredRecord<UrlAuditEvent>> }> {
    const state = await this.readState();
    return {
      probes: state.probes.filter((item) => !item.synced).slice(0, limit),
      audits: state.audits.filter((item) => !item.synced).slice(0, limit)
    };
  }

  async markSynced(kind: "probe" | "audit", ids: string[]): Promise<void> {
    const state = await this.readState();
    const items = kind === "probe" ? state.probes : state.audits;
    for (const item of items) {
      if (ids.includes(item.id)) {
        item.synced = true;
      }
    }
    await this.writeState(state);
  }

  async appendBitableRows(rows: Array<{ kind: "probe" | "audit"; payload: unknown }>): Promise<void> {
    const state = await this.readState();
    const syncedAt = new Date().toISOString();
    state.bitableRows.push(
      ...rows.map((row) => ({
        id: randomUUID(),
        kind: row.kind,
        payload: row.payload,
        syncedAt
      }))
    );
    await this.writeState(state);
  }

  async appendNotification(level: "info" | "warning" | "error", title: string, body: string): Promise<void> {
    const state = await this.readState();
    state.notifications.push({
      id: randomUUID(),
      level,
      title,
      body,
      createdAt: new Date().toISOString()
    });
    await this.writeState(state);
  }

  private async readState(): Promise<FileState> {
    return JSON.parse(await readFile(this.filePath, "utf8")) as FileState;
  }

  private async writeState(state: FileState): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }
}

class PostgresStore implements AppStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      create table if not exists devices (
        device_id text primary key,
        payload jsonb not null,
        created_at timestamptz not null default now()
      );

      create table if not exists probes (
        id uuid primary key,
        payload jsonb not null,
        synced boolean not null default false,
        created_at timestamptz not null default now()
      );

      create table if not exists audits (
        id uuid primary key,
        payload jsonb not null,
        synced boolean not null default false,
        created_at timestamptz not null default now()
      );

      create table if not exists bitable_rows (
        id uuid primary key,
        kind text not null,
        payload jsonb not null,
        synced_at timestamptz not null default now()
      );

      create table if not exists notifications (
        id uuid primary key,
        level text not null,
        title text not null,
        body text not null,
        created_at timestamptz not null default now()
      );
    `);
  }

  async registerDevice(payload: DeviceRegistrationRequest): Promise<void> {
    await this.pool.query(
      `
        insert into devices (device_id, payload)
        values ($1, $2::jsonb)
        on conflict (device_id)
        do update set payload = excluded.payload, created_at = now()
      `,
      [payload.deviceId, JSON.stringify(payload)]
    );
  }

  async appendProbes(events: ProbeActionEvent[]): Promise<number> {
    for (const event of events) {
      await this.pool.query(
        `insert into probes (id, payload) values ($1, $2::jsonb)`,
        [randomUUID(), JSON.stringify(event)]
      );
    }
    return events.length;
  }

  async appendAudits(events: UrlAuditEvent[]): Promise<number> {
    for (const event of events) {
      await this.pool.query(
        `insert into audits (id, payload) values ($1, $2::jsonb)`,
        [randomUUID(), JSON.stringify(event)]
      );
    }
    return events.length;
  }

  async getUnsynced(limit: number): Promise<{ probes: Array<StoredRecord<ProbeActionEvent>>; audits: Array<StoredRecord<UrlAuditEvent>> }> {
    const [probeRows, auditRows] = await Promise.all([
      this.pool.query<DbRow<ProbeActionEvent>>(
        `select id, payload, created_at from probes where synced = false order by created_at asc limit $1`,
        [limit]
      ),
      this.pool.query<DbRow<UrlAuditEvent>>(
        `select id, payload, created_at from audits where synced = false order by created_at asc limit $1`,
        [limit]
      )
    ]);

    return {
      probes: probeRows.rows.map((row) => ({
        ...(row.payload as ProbeActionEvent),
        id: row.id,
        createdAt: row.created_at.toISOString(),
        synced: false
      })),
      audits: auditRows.rows.map((row) => ({
        ...(row.payload as UrlAuditEvent),
        id: row.id,
        createdAt: row.created_at.toISOString(),
        synced: false
      }))
    };
  }

  async markSynced(kind: "probe" | "audit", ids: string[]): Promise<void> {
    if (!ids.length) {
      return;
    }
    const table = kind === "probe" ? "probes" : "audits";
    await this.pool.query(`update ${table} set synced = true where id = any($1::uuid[])`, [ids]);
  }

  async appendBitableRows(rows: Array<{ kind: "probe" | "audit"; payload: unknown }>): Promise<void> {
    for (const row of rows) {
      await this.pool.query(
        `insert into bitable_rows (id, kind, payload) values ($1, $2, $3::jsonb)`,
        [randomUUID(), row.kind, JSON.stringify(row.payload)]
      );
    }
  }

  async appendNotification(level: "info" | "warning" | "error", title: string, body: string): Promise<void> {
    await this.pool.query(
      `insert into notifications (id, level, title, body) values ($1, $2, $3, $4)`,
      [randomUUID(), level, title, body]
    );
  }
}

export function createStore(): AppStore {
  if (process.env.DATABASE_URL) {
    return new PostgresStore(process.env.DATABASE_URL);
  }
  return new FileStore();
}
