import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  testMatch:'portal-authenticated.spec.mjs',
  timeout:60000,
  expect:{timeout:12000},
  fullyParallel:false,
  workers:1,
  retries:1,
  reporter:'list',
  use:{
    baseURL:process.env.IPASS_ORIGIN||'https://ipass.i-pass-eval.workers.dev',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  },
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]
});
