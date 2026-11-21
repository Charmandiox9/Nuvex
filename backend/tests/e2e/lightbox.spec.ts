import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { hash } from '@node-rs/argon2';
import { Secret, TOTP } from 'otpauth';
import sharp from 'sharp';

const input = { username: 'lb-' + randomUUID().slice(0, 12), password: 'nuvex playwright lightbox password' };

test.beforeAll(async () => {
  const { createDatabase } = await import('../../dist/prisma/client.js');
  const { Storage } = await import('../../dist/src/storage/storage.js');
  const db = createDatabase();
  const storage = new Storage();
  try {
    const owner = await db.owner.create({ data: { username: input.username, passwordHash: await hash(input.password) } });
    const colors = ['#66aa88', '#aa8866'];
    const names = ['dos.png', 'uno.png'];
    for (let index = 0; index < names.length; index += 1) {
      const buffer = await sharp({ create: { width: 40, height: 30, channels: 3, background: colors[index] } }).webp().toBuffer();
      const key = 'media/' + randomUUID() + '/preview.webp';
      await storage.put(key, buffer, buffer.length);
      await db.entry.create({ data: {
        ownerId: owner.id, parentId: '', name: names[index], kind: 'file', mime: 'image/png', size: BigInt(buffer.length),
        objectKey: key, previewKey: key, posterKey: key, mediaStatus: 'ready',
      } });
    }
  } finally { await db.$disconnect(); }
});

test.afterAll(async () => {
  const { createDatabase } = await import('../../dist/prisma/client.js');
  const { Storage } = await import('../../dist/src/storage/storage.js');
  const db = createDatabase();
  const storage = new Storage();
  try {
    const owner = await db.owner.findUnique({ where: { username: input.username } });
    if (!owner) return;
    const entries = await db.entry.findMany({ where: { ownerId: owner.id } });
    const keys = entries.flatMap((row) => [row.objectKey, row.previewKey, row.posterKey]).filter((key): key is string => Boolean(key));
    await Promise.allSettled(keys.map((key) => storage.delete(key)));
    await db.audit.deleteMany({ where: { ownerId: owner.id } });
    await db.upload.deleteMany({ where: { ownerId: owner.id } });
    await db.entry.deleteMany({ where: { ownerId: owner.id } });
    await db.session.deleteMany({ where: { ownerId: owner.id } });
    await db.owner.delete({ where: { id: owner.id } });
  } finally { await db.$disconnect(); }
});

test('abre el visor, navega con el teclado y cierra', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill(input.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(input.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Configura tu autenticador' })).toBeVisible();
  const key = await page.locator('.setup code').textContent();
  await page.getByLabel('Código de verificación').fill(new TOTP({ secret: Secret.fromBase32(key!) }).generate());
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await page.getByRole('button', { name: 'Abrir mi drive' }).click();

  await page.getByRole('link', { name: 'Galería', exact: true }).click();
  await expect(page).toHaveURL(/\/drive\/gallery$/);
  await expect(page.locator('.file-thumb')).toHaveCount(2);
  await page.getByRole('button', { name: /dos\.png/ }).click();
  await expect(page.locator('.lightbox')).toBeVisible();
  await expect(page.locator('.lightbox-title')).toHaveText('dos.png');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.lightbox-title')).toHaveText('uno.png');
  await page.keyboard.press('Escape');
  await expect(page.locator('.lightbox')).toHaveCount(0);
});
