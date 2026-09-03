import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  testMatch:'portal-ui.spec.mjs',
  timeout:45000,
  expect:{timeout:15000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:[['list'],['html',{outputFolder:'playwright-report',open:'never'}]],
  use:{
    baseURL:'http://127.0.0.1:8787',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  },
  webServer:{
    command:'npm run dev:test',
    url:'http://127.0.0.1:8787/api/health',
    timeout:120000,
    reuseExistingServer:false
  },
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]
});
