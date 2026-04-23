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
  appendBitableRows(
    rows: Array<{
      kind: "probe" | "audit";
      sourceId: string;
      tableId: string;
      payload: unknown;
      externalRecordId?: string;
      syncedAt: string;
    }>
  ): Promise<void>;
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
        source_id text,
        table_id text,
        payload text not null,
        external_record_id text,
        status text,
        error_message text,
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
    this.ensureColumn("bitable_rows", "source_id", "text");
    this.ensureColumn("bitable_rows", "table_id", "text");
    this.ensureColumn("bitable_rows", "external_record_id", "text");
    this.ensureColumn("bitable_rows", "status", "text");
    this.ensureColumn("bitable_rows", "error_message", "text");
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

  async appendBitableRows(
    rows: Array<{
      kind: "probe" | "audit";
      sourceId: string;
      tableId: string;
      payload: unknown;
      externalRecordId?: string;
      syncedAt: string;
    }>
  ): Promise<void> {
    const statement = this.db.prepare(
      `
        insert into bitable_rows (id, kind, source_id, table_id, payload, external_record_id, status, synced_at)
        values (@id, @kind, @source_id, @table_id, @payload, @external_record_id, @status, @synced_at)
      `
    );
    const insertMany = this.db.transaction(
      (
        items: Array<{
          kind: "probe" | "audit";
          sourceId: string;
          tableId: string;
          payload: unknown;
          externalRecordId?: string;
          syncedAt: string;
        }>
      ) => {
      for (const item of items) {
        statement.run({
          id: randomUUID(),
          kind: item.kind,
          source_id: item.sourceId,
          table_id: item.tableId,
          payload: JSON.stringify(item.payload),
          external_record_id: item.externalRecordId ?? null,
          status: "synced",
          synced_at: item.syncedAt
        });
      }
      }
    );
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

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.db
      .prepare(`pragma table_info(${table})`)
      .all()
      .map((row) => (row as { name: string }).name);

    if (!columns.includes(column)) {
      this.db.exec(`alter table ${table} add column ${column} ${definition}`);
    }
  }
}

export function createStore(): AppStore {
  return new SqliteStore();
}
