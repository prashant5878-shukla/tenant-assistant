import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { env: { MONGO_DB: 'leadlane_test', LOG_LEVEL: 'silent', NODE_ENV: 'test' }, testTimeout: 60000, hookTimeout: 60000, fileParallelism: false },
});
