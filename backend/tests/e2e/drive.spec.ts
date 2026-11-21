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
  await page.goto('/');
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
  await expect(page.getByRole('heading', { name: 'Mis archivos' })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva carpeta' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Documentos');
  await page.getByRole('dialog').getByRole('button', { name: 'Nueva carpeta' }).click();
  await page.getByRole('button', { name: /Documentos/ }).click();
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Subir archivos' }).click(),
  ]);
  await picker.setFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('Nuvex') });
  await expect(page.getByText(/Completada/)).toBeVisible();
  await page.getByRole('button', { name: 'Mis archivos', exact: true }).click();
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
  } finally { await context.close(); }
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Mover a papelera' }).click();
  await page.getByRole('button', { name: 'Papelera', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Seleccionar renombrado.txt' }).check();
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'La papelera está vacía' })).toBeVisible();
});
