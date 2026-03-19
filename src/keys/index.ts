import { getDb } from "../db";
import { nanoid } from "nanoid";

const KEY_PREFIX = "rsy-";

function hashKey(key: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(key);
  return hasher.digest("hex");
}

export interface CreatedKey {
  id: number;
  rawKey: string; // only returned once at creation
  prefix: string;
  name: string;
}

export async function createKey(
  userId: string,
  name: string,
  spendLimitCents: number | null = null
): Promise<CreatedKey> {
  const raw = KEY_PREFIX + nanoid(40);
  const hash = hashKey(raw);
  const prefix = raw.slice(0, 12);

  const db = getDb();
  const result = await db
    .insertInto("api_keys")
    .values({
      key_hash: hash,
      key_prefix: prefix,
      user_id: userId,
      name,
      spend_limit_cents: spendLimitCents,
      spent_cents: 0,
      active: 1,
      created_at: new Date().toISOString(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { id: result.id, rawKey: raw, prefix, name };
}

export interface ResolvedKey {
  id: number;
  userId: string;
  name: string;
  active: boolean;
}

export async function resolveKey(rawKey: string): Promise<ResolvedKey | null> {
  const hash = hashKey(rawKey);
  const db = getDb();

  const key = await db
    .selectFrom("api_keys")
    .select(["id", "user_id", "name", "active"])
    .where("key_hash", "=", hash)
    .executeTakeFirst();

  if (!key) return null;

  return {
    id: key.id,
    userId: key.user_id,
    name: key.name,
    active: key.active === 1,
  };
}

export async function revokeKey(keyId: number): Promise<void> {
  const db = getDb();
  await db
    .updateTable("api_keys")
    .set({ active: 0 })
    .where("id", "=", keyId)
    .execute();
}

export async function setKeySpendLimit(
  keyId: number,
  limitCents: number | null
): Promise<void> {
  const db = getDb();
  await db
    .updateTable("api_keys")
    .set({ spend_limit_cents: limitCents })
    .where("id", "=", keyId)
    .execute();
}

export async function listUserKeys(userId: string) {
  const db = getDb();
  return db
    .selectFrom("api_keys")
    .select([
      "id",
      "key_prefix",
      "name",
      "spend_limit_cents",
      "spent_cents",
      "active",
      "created_at",
    ])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();
}
