import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SITE_ORIGIN = 'http://localhost:4321';
const APP_ORIGIN = 'http://localhost:5173';
const API_ORIGIN = 'http://localhost:3000';
const ARTIFACT_DIR = join(process.cwd(), '.artifacts', 'prompt-transfer-e2e');
const APP_TEXTAREA_PLACEHOLDER = 'Опишите ваш проект или выберите пример ниже';
const SITE_TEXTAREA_PLACEHOLDER = 'Например: нужен график ремонта офиса 250 м2 в 2 этапа, с демонтажом, инженерией, чистовой отделкой и запуском за 90 дней';

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const results = [];
  try {
    results.push(await runScenario(browser, 'guest-login-empty-project', scenarioGuestLoginEmptyProject));
    results.push(await runScenario(browser, 'repeat-prompt-same-empty-project', scenarioRepeatPromptSameEmptyProject));
    results.push(await runScenario(browser, 'reuse-other-empty-project', scenarioReuseOtherEmptyProject));
    results.push(await runScenario(browser, 'no-empty-project-create-modal', scenarioNoEmptyProjectCreateModal));
    results.push(await runScenario(browser, 'guest-login-no-empty-project-create-modal', scenarioGuestLoginNoEmptyProjectCreateModal));
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

async function runScenario(browser, name, fn) {
  console.log(`\n[scenario] ${name}`);
  const startedAt = Date.now();
  const result = await fn(browser, name);
  const durationMs = Date.now() - startedAt;
  console.log(`[scenario] ${name} ok in ${durationMs}ms`);
  return { name, durationMs, ...result };
}

async function scenarioGuestLoginEmptyProject(browser, name) {
  const prompt = 'Гостевой вход: нужен график ремонта офиса на две очереди';
  const session = await createUserSession(name);
  const { context, page } = await createContext(browser);

  try {
    await submitSitePrompt(page, prompt);
    await page.waitForURL('**/login?next=*', { timeout: 20000 });
    await expectOtpModal(page);

    await setAppStorage(page, await buildAuthStorage(session));
    await page.reload({ waitUntil: 'domcontentloaded' });

    const value = await waitForAppPromptValue(page, prompt);
    await screenshot(page, name, 'after-login-prefill');
    return {
      prompt,
      currentUrl: page.url(),
      fieldValue: value,
    };
  } finally {
    await context.close();
  }
}

async function scenarioRepeatPromptSameEmptyProject(browser, name) {
  const promptA = 'Первый prompt для пустого проекта';
  const promptB = 'Второй prompt после возврата на лендинг';
  const session = await createUserSession(name);
  const { context, page } = await createContext(browser, await buildAuthStorage(session));

  try {
    await submitSitePrompt(page, promptA);
    assert.equal(await waitForAppPromptValue(page, promptA), promptA);
    await screenshot(page, name, 'first-prefill');

    await submitSitePrompt(page, promptB);
    const secondValue = await waitForAppPromptValue(page, promptB);
    await screenshot(page, name, 'second-prefill');

    return {
      promptA,
      promptB,
      secondValue,
      currentUrl: page.url(),
    };
  } finally {
    await context.close();
  }
}

async function scenarioReuseOtherEmptyProject(browser, name) {
  const prompt = 'Переключи меня в другой пустой проект и подставь prompt';
  const session = await createUserSession(name);
  const spareProject = await createProject(session, 'Запасной пустой проект');
  await seedTask(session.project.id, `Busy seed for ${name}`);
  const storage = await buildAuthStorage(session);
  const { context, page } = await createContext(browser, storage);

  try {
    await submitSitePrompt(page, prompt);
    const value = await waitForAppPromptValue(page, prompt);
    const activeProject = JSON.parse(await page.evaluate(() => localStorage.getItem('gantt_project') ?? 'null'));
    assert.equal(activeProject?.id, spareProject.id, 'Expected app to switch to the spare empty project');
    await screenshot(page, name, 'spare-project-prefill');

    return {
      prompt,
      activeProjectId: activeProject?.id ?? null,
      expectedProjectId: spareProject.id,
      fieldValue: value,
    };
  } finally {
    await context.close();
  }
}

async function scenarioNoEmptyProjectCreateModal(browser, name) {
  const prompt = 'Если пустого проекта нет, должна открыться модалка создания проекта';
  const session = await createUserSession(name);
  await seedTask(session.project.id, `Busy seed for ${name}`);
  const { context, page } = await createContext(browser, await buildAuthStorage(session));

  try {
    await submitSitePrompt(page, prompt);
    const modalInput = page.locator('#new-project-name');
    await modalInput.waitFor({ state: 'visible', timeout: 20000 });
    const initialName = await modalInput.inputValue();
    assert.equal(initialName, 'Новый проект');
    await screenshot(page, name, 'create-modal-open');

    const submitButton = page.getByRole('button', { name: 'Создать' });
    if (await submitButton.count() === 0) {
      await page.getByRole('button', { name: 'Архивировать и создать' }).click();
    } else {
      await submitButton.click();
    }

    const value = await waitForAppPromptValue(page, prompt);
    const activeProject = JSON.parse(await page.evaluate(() => localStorage.getItem('gantt_project') ?? 'null'));
    assert.notEqual(activeProject?.id, session.project.id, 'Expected a new project after modal submission');
    await screenshot(page, name, 'created-project-prefill');

    return {
      prompt,
      previousProjectId: session.project.id,
      newProjectId: activeProject?.id ?? null,
      fieldValue: value,
    };
  } finally {
    await context.close();
  }
}

async function scenarioGuestLoginNoEmptyProjectCreateModal(browser, name) {
  const prompt = 'Гость без пустого проекта после логина должен увидеть модалку создания';
  const session = await createUserSession(name);
  await seedTask(session.project.id, `Busy seed for ${name}`);
  const { context, page } = await createContext(browser);

  try {
    await submitSitePrompt(page, prompt);
    await page.waitForURL('**/login?next=*', { timeout: 20000 });
    await expectOtpModal(page);

    await setAppStorage(page, await buildAuthStorage(session));
    await page.reload({ waitUntil: 'domcontentloaded' });

    const modalInput = page.locator('#new-project-name');
    await modalInput.waitFor({ state: 'visible', timeout: 20000 });
    const initialName = await modalInput.inputValue();
    assert.equal(initialName, 'Новый проект');
    await screenshot(page, name, 'modal-after-login');

    return {
      prompt,
      currentUrl: page.url(),
      initialName,
    };
  } finally {
    await context.close();
  }
}

async function createContext(browser, storage = null) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });

  if (storage) {
    await context.addInitScript(
      ({ appOrigin, entries }) => {
        if (window.location.origin !== appOrigin) {
          return;
        }
        for (const [key, value] of entries) {
          window.localStorage.setItem(key, value);
        }
      },
      { appOrigin: APP_ORIGIN, entries: Object.entries(storage) },
    );
  }

  const page = await context.newPage();
  return { context, page };
}

async function submitSitePrompt(page, prompt) {
  await page.goto(SITE_ORIGIN, { waitUntil: 'networkidle' });
  const textarea = page.getByPlaceholder(SITE_TEXTAREA_PLACEHOLDER);
  await textarea.waitFor({ state: 'visible', timeout: 20000 });
  await textarea.fill(prompt);
  await page.getByRole('button', { name: 'Создать график' }).click();
  await page.waitForURL(`${APP_ORIGIN}/**`, { timeout: 20000 });
}

async function waitForAppPromptValue(page, expectedPrompt) {
  const textarea = page.getByPlaceholder(APP_TEXTAREA_PLACEHOLDER);
  await textarea.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForFunction(
    ({ placeholder, expected }) => {
      const element = document.querySelector(`textarea[placeholder="${placeholder}"]`);
      return element instanceof HTMLTextAreaElement && element.value === expected;
    },
    { placeholder: APP_TEXTAREA_PLACEHOLDER, expected: expectedPrompt },
    { timeout: 20000 },
  );
  const value = await textarea.inputValue();
  assert.equal(value, expectedPrompt);
  return value;
}

async function expectOtpModal(page) {
  await page.getByText('Вход в ГетГант', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#email').waitFor({ state: 'visible', timeout: 20000 });
}

async function setAppStorage(page, storage) {
  await page.evaluate((entries) => {
    for (const [key, value] of entries) {
      window.localStorage.setItem(key, value);
    }
  }, Object.entries(storage));
}

async function buildAuthStorage(session) {
  const projects = await authFetch(session, '/api/projects').then((payload) => payload.projects);
  const groups = await authFetch(session, '/api/project-groups').then((payload) => payload.groups);
  const activeProject = projects.find((project) => project.id === session.project.id) ?? session.project;

  return {
    gantt_access_token: session.accessToken,
    gantt_refresh_token: session.refreshToken,
    gantt_user: JSON.stringify(session.user),
    gantt_project: JSON.stringify(activeProject),
    gantt_projects: JSON.stringify(projects),
    gantt_project_groups: JSON.stringify(groups),
  };
}

async function createUserSession(seed) {
  const email = `codex-${seed}-${Date.now()}@example.com`;
  const otpRequest = await fetch(`${API_ORIGIN}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(otpRequest.status, 200, `Failed to request OTP for ${email}`);

  const otp = await waitForOtpCode(email);
  const loginResponse = await fetch(`${API_ORIGIN}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code: otp }),
  });
  assert.equal(loginResponse.status, 200, `Failed to verify OTP for ${email}`);
  return await loginResponse.json();
}

async function waitForOtpCode(email) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const otp = await prisma.otpCode.findFirst({
      where: { email, used: false },
      orderBy: { id: 'desc' },
    });
    if (otp?.code) {
      return otp.code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`OTP for ${email} was not created in time`);
}

async function authFetch(session, path, init = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (response.status === 401) {
    const refresh = await fetch(`${API_ORIGIN}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    assert.equal(refresh.status, 200, `Failed to refresh token for ${path}`);
    const refreshed = await refresh.json();
    session.accessToken = refreshed.accessToken;
    session.refreshToken = refreshed.refreshToken;
    if (refreshed.project) {
      session.project = refreshed.project;
    }
    return authFetch(session, path, init);
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}: ${raw}`);
  }
  return raw.trim() ? JSON.parse(raw) : {};
}

async function createProject(session, name) {
  const payload = await authFetch(session, '/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, groupId: session.project.groupId }),
  });
  return payload.project;
}

async function seedTask(projectId, name) {
  await prisma.task.create({
    data: {
      projectId,
      name,
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: new Date('2026-05-05T00:00:00.000Z'),
      sortOrder: 1,
    },
  });
}

async function screenshot(page, scenario, label) {
  await page.screenshot({
    path: join(ARTIFACT_DIR, `${scenario}-${label}.png`),
    fullPage: true,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
