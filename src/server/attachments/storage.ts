import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { getEnv } from '../config/env';

/**
 * Storage boundary (docs/PRODUCT_REQUIREMENTS.md A7). Files are written under a random key,
 * never the uploader's filename, and always outside the web root — nothing is reachable by
 * guessing a URL (docs/SECURITY_MODEL.md T7).
 */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements Storage {
  private root(): string {
    return resolve(process.cwd(), getEnv().STORAGE_LOCAL_PATH);
  }

  /** Guards against traversal in a key that somehow reached us from outside. */
  private pathFor(key: string): string {
    const full = resolve(join(this.root(), key));
    if (!full.startsWith(this.root())) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }
}

/**
 * S3 driver placeholder. Deliberately unimplemented rather than half-implemented: the
 * interface is what keeps the domain provider-neutral, and env validation refuses `s3`
 * until a driver is wired up.
 */
class S3Storage implements Storage {
  async put(): Promise<void> {
    throw new Error('S3 storage driver is not configured in this deployment');
  }
  async get(): Promise<Buffer> {
    throw new Error('S3 storage driver is not configured in this deployment');
  }
  async delete(): Promise<void> {
    throw new Error('S3 storage driver is not configured in this deployment');
  }
}

let instance: Storage | null = null;

export function getStorage(): Storage {
  if (!instance) instance = getEnv().STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
  return instance;
}

export function setStorage(storage: Storage | null) {
  instance = storage;
}

/** Random, date-partitioned key. Contains nothing derived from user input. */
export function newStorageKey(ticketId: string, extension: string): string {
  const now = new Date();
  const safeExt = /^[a-z0-9]{1,8}$/i.test(extension) ? extension.toLowerCase() : 'bin';
  return [
    'tickets',
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    ticketId,
    `${randomBytes(16).toString('hex')}.${safeExt}`,
  ].join('/');
}

export function checksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
