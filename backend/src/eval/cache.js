import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

/** Tiny JSON-file cache so eval reruns cost nothing when neither code, prompts nor data changed. */
export class FileCache {
  constructor(file) {
    this.file = file;
    this.data = null;
  }
  static key(...parts) {
    return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
  }
  async #load() {
    if (this.data) return;
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch {
      this.data = {};
    }
  }
  async get(key) {
    await this.#load();
    return this.data[key];
  }
  async set(key, value) {
    await this.#load();
    this.data[key] = value;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 1));
  }
}
