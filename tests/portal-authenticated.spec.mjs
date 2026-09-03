import { test, expect } from '@playwright/test';

async function login(page,email,password){
  await page.goto('/');
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.locator('#loginBtn').click();
  await expect(page).toHaveURL(/\/home(?:$|\?)/,{timeout:20000});
  await expect(page.locator('.home-v3-shell')).toBeVisible();
}
async function assertNoLeak(page){
  const text=await page.locator('body').innerText();
  expect(text).not.toContain('function renderAdminDetail');
  expect(text).not.toContain('const blob=new Blob');
  expect(text).not.toContain('서비스 처리 중 오류가 발생했습니다.');
}

const adminReady=Boolean(process.env.IPASS_ADMIN_EMAIL&&process.env.IPASS_ADMIN_PASSWORD);
const partnerReady=Boolean(process.env.IPASS_PARTNER_EMAIL&&process.env.IPASS_PARTNER_PASSWORD);

test('실제 관리자 로그인 후 핵심 읽기 화면을 순회한다',async({page})=>{
  test.skip(!adminReady,'관리자 브라우저 테스트 계정 Secret이 없습니다.');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await login(page,process.env.IPASS_ADMIN_EMAIL,process.env.IPASS_ADMIN_PASSWORD);
  await expect(page.locator('#ehsGlobalName')).not.toContainText('@');
  await page.locator('#ehsGlobalUserBtn').click();
  await expect(page.getByRole('button',{name:'회원가입 승인'})).toBeVisible();
  await page.goto('/admin/approvals');await expect(page.locator('h1')).toContainText('회원가입 승인');
  await page.goto('/admin/accounts');await expect(page.locator('h1')).toContainText('협력사 계정 관리');
  await page.goto('/admin/system');await expect(page.locator('h1')).toContainText('시스템 상태');
  await page.goto('/ipass');await expect(page.locator('#ipassShell')).toBeVisible();
  await page.goto('/ipass/templates');await expect(page.locator('iframe')).toHaveCount(0);
  await page.goto('/ipass/cycles');await expect(page.locator('iframe')).toHaveCount(0);
  await page.goto('/resources');await expect(page.locator('#pageTitle')).toContainText('안전자료실');
  await assertNoLeak(page);
  expect(errors).toEqual([]);
});

test('실제 협력사 로그인 후 홈과 평가 이력을 확인한다',async({page})=>{
  test.skip(!partnerReady,'협력사 브라우저 테스트 계정 Secret이 없습니다.');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await login(page,process.env.IPASS_PARTNER_EMAIL,process.env.IPASS_PARTNER_PASSWORD);
  await expect(page.locator('#ehsGlobalName')).not.toContainText('@');
  await page.goto('/ipass');await expect(page.locator('#ipassShell')).toBeVisible();
  await expect(page.locator('#sideNav .nav-btn')).toHaveCount(2);
  await page.goto('/ipass/evaluations');await expect(page.locator('#ipassShell')).toBeVisible();
  await page.goto('/committee');await expect(page.locator('#pageTitle')).toBeVisible();
  await page.goto('/education');await expect(page.locator('#pageTitle')).toBeVisible();
  await assertNoLeak(page);
  expect(errors).toEqual([]);
});
