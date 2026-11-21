import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { hash } from '@node-rs/argon2';
import { Secret, TOTP } from 'otpauth';

const input = { username: 'pw-' + randomUUID().slice(0, 12), password: 'nuvex playwright test password' };

test.beforeAll(async () => {
  const { createDatabase } = await import('../../dist/prisma/client.js');
  const db = createDatabase();
  try { await db.owner.create({ data: { username: input.username, passwordHash: await hash(input.password) } }); }
  finally { await db.$disconnect(); }
});

test.afterAll(async () => {
  const { createDatabase } = await import('../../dist/prisma/client.js');
  const { Storage } = await import('../../dist/src/storage/storage.js');
  const db = createDatabase();
  const storage = new Storage();
  try {
    const owner = await db.owner.findUnique({ where: { username: input.username } });
    if (!owner) return;
    const ownerId = owner.id;
    const entries = await db.entry.findMany({ where: { ownerId } });
    await Promise.allSettled(entries.flatMap((row) => row.objectKey ? [storage.delete(row.objectKey)] : []));
    const shares = await db.share.findMany({ where: { ownerId }, select: { id: true } });
    await db.guestSession.deleteMany({ where: { shareId: { in: shares.map((row) => row.id) } } });
    await db.share.deleteMany({ where: { ownerId } });
    await db.audit.deleteMany({ where: { ownerId } });
    await db.upload.deleteMany({ where: { ownerId } });
    await db.entry.deleteMany({ where: { ownerId } });
    await db.session.deleteMany({ where: { ownerId } });
    await db.owner.delete({ where: { id: ownerId } });
  } finally { await db.$disconnect(); }
});

test('configura TOTP, sube, renombra, comparte y restaura', async ({ page, browser }, info) => {
  await page.goto('/drive/storage');
  await expect(page).toHaveURL(/\?next=%2Fdrive%2Fstorage$/);
  expect((await page.request.get('/api/v1/storage/overview')).status()).toBe(401);
  await page.screenshot({ path: info.outputPath('inicio.png') });
  await page.getByLabel('Usuario', { exact: true }).fill(input.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(input.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Configura tu autenticador' })).toBeVisible();
  const key = await page.locator('.setup code').textContent();
  const code = new TOTP({ secret: Secret.fromBase32(key!) }).generate();
  await page.getByLabel('Código de verificación').fill(code);
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await page.getByRole('button', { name: 'Abrir mi drive' }).click();
  await expect(page).toHaveURL(/\/drive\/storage$/);
  const navigation = page.getByRole('navigation', { name: 'Drive' });
  await navigation.getByRole('link', { name: 'Mis archivos' }).click();
  await expect(page.getByRole('heading', { name: 'Mis archivos' })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva carpeta' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Documentos');
  await page.getByRole('dialog').getByRole('button', { name: 'Nueva carpeta' }).click();
  const folderLink = page.getByRole('link', { name: /Documentos/ });
  const folderPath = await folderLink.getAttribute('href');
  expect(folderPath).toMatch(/^\/drive\/folders\/[\da-f-]{36}$/);
  await folderLink.click();
  await expect(page).toHaveURL(new RegExp(`${folderPath}$`));
  await page.getByRole('button', { name: 'Nueva carpeta' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Subcarpeta');
  await page.getByRole('dialog').getByRole('button', { name: 'Nueva carpeta' }).click();
  const nestedRow = page.getByRole('article').filter({ has: page.getByRole('link', { name: /Subcarpeta/ }) });
  await nestedRow.getByRole('button', { name: 'Acciones del elemento' }).click();
  await page.getByRole('menuitem', { name: 'Abrir', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Subcarpeta' })).toBeVisible();
  const nestedUrl = page.url();
  await navigation.getByRole('link', { name: 'Galería' }).click();
  await expect(page).toHaveURL(/\/drive\/gallery$/);
  await page.goBack();
  await expect(page).toHaveURL(nestedUrl);
  await expect(page.getByRole('heading', { name: 'Subcarpeta' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/drive\/gallery$/);
  await page.goto(nestedUrl);
  await expect(page.getByRole('heading', { name: 'Subcarpeta' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Subcarpeta' })).toBeVisible();
  await page.getByRole('link', { name: 'Documentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  let releaseParts = () => {};
  const partsPaused = new Promise<void>((resolve) => { releaseParts = resolve; });
  const attempts: string[] = [];
  const firstParts: string[] = [];
  const blockBytes = 8 * 1024 ** 2;
  await page.route('**/api/v1/uploads/*/parts/*', async (route) => {
    const request = route.request();
    if (request.url().endsWith('/parts/2')) {
      attempts.push(request.url());
      if (attempts.length === 1) { await route.abort(); return; }
    } else {
      if (request.postDataBuffer()?.length === blockBytes) firstParts.push(request.url());
      await partsPaused;
    }
    await route.continue();
  });
  const choose = async (files: { name: string; mimeType: string; buffer: Buffer }[]) => {
    const [picker] = await Promise.all([
      page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Subir archivos' }).click(),
    ]);
    await picker.setFiles(files);
  };
  await choose(['nota.txt', 'apuntes.txt', 'lista.txt'].map((name) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(name) })));
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await choose([{ name: 'reintento.txt', mimeType: 'text/plain', buffer: Buffer.alloc(blockBytes + 1, 65) }]);
  const summary = page.getByRole('button', { name: /^Ver transferencias/ });
  await expect(summary).toHaveText(/En curso: 3 · En cola: 1/);
  await summary.click();
  await expect(page).toHaveURL(/\/drive\/transfers$/);
  await expect(page.getByRole('heading', { name: 'Transferencias', exact: true })).toBeVisible();
  releaseParts();
  await page.getByRole('button', { name: 'Reintentar reintento.txt' }).click();
  await expect(page.getByText(/Completada/)).toHaveCount(4);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toBe(attempts[0]);
  expect(firstParts).toEqual([attempts[0].replace(/2$/, '1')]);
  await navigation.getByRole('link', { name: 'Mis archivos', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Seleccionar nota.txt' }).check();
  await page.getByRole('button', { name: 'Renombrar' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('renombrado.txt');
  await page.getByRole('dialog').getByRole('button', { name: 'Renombrar' }).click();
  await page.getByRole('checkbox', { name: 'Seleccionar renombrado.txt' }).check();
  await page.screenshot({ path: info.outputPath('explorador.png') });
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await page.getByLabel('Permitir descargas').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Compartir', exact: true }).click();
  const url = await page.getByLabel('Enlace', { exact: true }).inputValue();
  const invitation = await page.getByLabel('Código de invitado').inputValue();
  const context = await browser.newContext();
  try {
    const guest = await context.newPage();
    await guest.goto(url);
    await guest.getByLabel('Código de invitado').fill(invitation);
    await guest.getByRole('button', { name: 'Abrir enlace' }).click();
    await expect(guest.getByRole('heading', { name: 'renombrado.txt' })).toBeVisible();
    await guest.reload();
    await expect(guest.getByRole('link', { name: 'Descargar' })).toBeVisible();
    expect((await guest.request.get('/api/v1/storage/overview')).status()).toBe(401);
  } finally { await context.close(); }
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Mover a papelera' }).click();
  await navigation.getByRole('link', { name: 'Papelera', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Seleccionar renombrado.txt' }).check();
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'La papelera está vacía' })).toBeVisible();
  const storageButton = navigation.getByRole('link', { name: 'Almacenamiento', exact: true });
  await storageButton.click();
  const quota = page.getByRole('region', { name: 'Cuota de Nuvex' });
  const volume = page.getByRole('region', { name: 'Volumen de archivos' });
  const trash = page.getByRole('region', { name: 'Peso de la papelera' });
  const largest = page.getByRole('region', { name: 'Archivos más grandes' });
  await expect(trash.getByText('0 B', { exact: true })).toBeVisible();
  await expect(largest.getByRole('listitem').first()).toContainText('reintento.txt');
  await expect(quota.getByText(/^8 MB de /)).toBeVisible();
  const report = await page.request.get('/api/v1/storage/overview');
  expect(report.ok()).toBe(true);
  if ((await report.json()).volume) await expect(volume.getByText(/ libres$/)).toBeVisible();
  else await expect(volume.getByText(/medición reciente/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('almacenamiento.png') });

  await navigation.getByRole('link', { name: 'Mis archivos', exact: true }).click();
  await page.locator('.workspace-heading').getByRole('link', { name: 'Mis archivos', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Seleccionar Documentos' }).check();
  await page.getByRole('button', { name: 'Mover a papelera' }).click();
  await storageButton.click();
  await expect(trash.getByText('8 MB', { exact: true })).toBeVisible();
  await expect(largest.getByText('Todavía no hay archivos fuera de la papelera.')).toBeVisible();
  await expect(quota.getByText(/^8 MB de /)).toBeVisible();
  await page.goto(nestedUrl);
  await expect(page.getByRole('heading', { name: 'Carpeta no disponible' })).toBeVisible();
});
