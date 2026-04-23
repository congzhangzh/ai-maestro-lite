import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import type { DeviceRegistrationRequest, ProbeActionEvent, UrlAuditEvent } from "@ai-maestro-lite/shared";

type StoredRecord<T> = T & {
  id: string;
  synced: boolean;
  createdAt: string;
};

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

type StoredSyncRow = {
  id: string;
  payload: string;
  created_at: string;
};

class SqliteStore implements AppStore {
  private readonly dataDir = path.resolve(process.cwd(), "data");
  private readonly filePath = path.join(this.dataDir, "app-store.sqlite");
  private db!: Database.Database;

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    this.db = new Database(this.filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      create table if not exists devices (
        device_id text primary key,
        payload text not null,
        created_at text not null
      );

      create table if not exists probes (
        id text primary key,
        payload text not null,
        synced integer not null default 0,
        created_at text not null
      );

      create table if not exists audits (
        id text primary key,
        payload text not null,
        synced integer not null default 0,
        created_at text not null
      );

      create table if not exists bitable_rows (
        id text primary key,
        kind text not null,
        payload text not null,
        synced_at text not null
      );

      create table if not exists notifications (
        id text primary key,
        level text not null,
        title text not null,
        body text not null,
        created_at text not null
      );
    `);
  }

  async registerDevice(payload: DeviceRegistrationRequest): Promise<void> {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `
          insert into devices (device_id, payload, created_at)
          values (@device_id, @payload, @created_at)
          on conflict(device_id) do update set
            payload = excluded.payload,
            created_at = excluded.created_at
        `
      )
      .run({
        device_id: payload.deviceId,
        payload: JSON.stringify(payload),
        created_at: createdAt
      });
  }

  async appendProbes(events: ProbeActionEvent[]): Promise<number> {
    const now = new Date().toISOString();
    const statement = this.db.prepare(
      `
        insert into probes (id, payload, synced, created_at)
        values (@id, @payload, 0, @created_at)
      `
    );
    const insertMany = this.db.transaction((items: ProbeActionEvent[]) => {
      for (const item of items) {
        statement.run({
          id: randomUUID(),
          payload: JSON.stringify(item),
          created_at: now
        });
      }
    });
    insertMany(events);
    return events.length;
  }

  async appendAudits(events: UrlAuditEvent[]): Promise<number> {
    const now = new Date().toISOString();
    const statement = this.db.prepare(
      `
        insert into audits (id, payload, synced, created_at)
        values (@id, @payload, 0, @created_at)
      `
    );
    const insertMany = this.db.transaction((items: UrlAuditEvent[]) => {
      for (const item of items) {
        statement.run({
          id: randomUUID(),
          payload: JSON.stringify(item),
          created_at: now
        });
      }
    });
    insertMany(events);
    return events.length;
  }

  async getUnsynced(limit: number): Promise<{ probes: Array<StoredRecord<ProbeActionEvent>>; audits: Array<StoredRecord<UrlAuditEvent>> }> {
    return {
      probes: this.db
        .prepare(
          `
            select id, payload, created_at
            from probes
            where synced = 0
            order by created_at asc
            limit ?
          `
        )
        .all(limit)
        .map((row) => this.deserializeRow<ProbeActionEvent>(row)),
      audits: this.db
        .prepare(
          `
            select id, payload, created_at
            from audits
            where synced = 0
            order by created_at asc
            limit ?
          `
        )
        .all(limit)
        .map((row) => this.deserializeRow<UrlAuditEvent>(row))
    };
  }

  async markSynced(kind: "probe" | "audit", ids: string[]): Promise<void> {
    if (!ids.length) {
      return;
    }
    const table = kind === "probe" ? "probes" : "audits";
    const placeholders = ids.map(() => "?").join(", ");
    this.db.prepare(`update ${table} set synced = 1 where id in (${placeholders})`).run(...ids);
  }

  async appendBitableRows(rows: Array<{ kind: "probe" | "audit"; payload: unknown }>): Promise<void> {
    const syncedAt = new Date().toISOString();
    const statement = this.db.prepare(
      `
        insert into bitable_rows (id, kind, payload, synced_at)
        values (@id, @kind, @payload, @synced_at)
      `
    );
    const insertMany = this.db.transaction((items: Array<{ kind: "probe" | "audit"; payload: unknown }>) => {
      for (const item of items) {
        statement.run({
          id: randomUUID(),
          kind: item.kind,
          payload: JSON.stringify(item.payload),
          synced_at: syncedAt
        });
      }
    });
    insertMany(rows);
  }

  async appendNotification(level: "info" | "warning" | "error", title: string, body: string): Promise<void> {
    this.db
      .prepare(
        `
          insert into notifications (id, level, title, body, created_at)
          values (@id, @level, @title, @body, @created_at)
        `
      )
      .run({
        id: randomUUID(),
        level,
        title,
        body,
        created_at: new Date().toISOString()
      });
  }

  private deserializeRow<T>(row: unknown): StoredRecord<T> {
    const typedRow = row as StoredSyncRow;
    return {
      ...(JSON.parse(typedRow.payload) as T),
      id: typedRow.id,
      synced: false,
      createdAt: typedRow.created_at
    };
  }
}

export function createStore(): AppStore {
  return new SqliteStore();
}
