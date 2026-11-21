import { hash } from '@node-rs/argon2';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { createDatabase } from '../prisma/client';

async function run() {
  if (!process.stdin.isTTY) throw new Error('Ejecuta este comando en una terminal interactiva.');
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  let hidden = false;
  const input = createInterface({ input: process.stdin, output, terminal: true });
  const database = createDatabase();
  try {
    const username = (await input.question('Usuario: ')).trim().normalize('NFKC').toLowerCase();
    if (!username || username.length > 80) {
      throw new Error('El usuario debe tener entre 1 y 80 caracteres.');
    }
    process.stdout.write('Contraseña (mínimo 8 caracteres): ');
    hidden = true;
    const password = await input.question('');
    process.stdout.write('\nRepite la contraseña: ');
    const confirmation = await input.question('');
    process.stdout.write('\n');
    if (password.length < 8 || password.length > 256) {
      throw new Error('La contraseña debe tener entre 8 y 256 caracteres.');
    }
    if (password !== confirmation) {
      throw new Error('Las contraseñas no coinciden.');
    }
    const passwordHash = await hash(password);
    await database.$transaction(async (tx) => {
      if (await tx.owner.count()) throw new Error('Ya existe una cuenta propietaria.');
      await tx.owner.create({ data: { username, passwordHash } });
    }, { isolationLevel: 'Serializable' });
    process.stdout.write('Cuenta creada. Configura TOTP al iniciar sesión.\n');
  } finally {
    input.close();
    await database.$disconnect();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error creando la cuenta.');
  process.exitCode = 1;
});
