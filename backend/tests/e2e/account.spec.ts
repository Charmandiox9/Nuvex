import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { hash } from '@node-rs/argon2';
import { Secret, TOTP } from 'otpauth';

const username = 'pw-' + randomUUID().slice(0, 12);
const password = 'nuvex playwright password one';
const next = 'nuvex playwright password two';

test.beforeAll(async () => {
  const { createDatabase } = await import('../../dist/prisma/client.js');
  const db = createDatabase();
  try { await db.owner.create({ data: { username, passwordHash: await hash(password) } }); }
  finally { await db.$disconnect(); }
});

test.afterAll(async () => {
  const { createDatabase } = await import('../../dist/prisma/client.js');
  const db = createDatabase();
  try {
    const owner = await db.owner.findUnique({ where: { username } });
    if (!owner) return;
    await db.audit.deleteMany({ where: { ownerId: owner.id } });
    await db.session.deleteMany({ where: { ownerId: owner.id } });
    await db.owner.delete({ where: { id: owner.id } });
  } finally { await db.$disconnect(); }
});

test('cambia la contraseña desde ajustes', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Configura tu autenticador' })).toBeVisible();
  const key = await page.locator('.setup code').textContent();
  await page.getByLabel('Código de verificación').fill(new TOTP({ secret: Secret.fromBase32(key!) }).generate());
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await page.getByRole('button', { name: 'Abrir mi drive' }).click();

  await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
  await expect(page).toHaveURL(/\/drive\/settings$/);
  const panel = page.locator('section.panel').filter({ hasText: 'Cambiar contraseña' });
  await expect(panel).toBeVisible();
  await panel.locator('#pw-current').fill(password);
  await panel.locator('#pw-next').fill(next);
  await panel.locator('#pw-repeat').fill(next);
  await panel.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();
  await expect(panel.locator('#pw-current')).toHaveValue('');
});
