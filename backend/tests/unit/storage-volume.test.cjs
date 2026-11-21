const { statfs } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { recentStorageVolume, recordStorageVolume, storageVolumeKey } = require('../../dist/src/storage/volume');

test('registra bytes del volumen y el momento de la medición', async () => {
  const previous = process.env.NUVEX_DISK_PATH;
  process.env.NUVEX_DISK_PATH = tmpdir();
  const upsert = jest.fn().mockResolvedValue(undefined);
  try {
    const stats = await statfs(tmpdir(), { bigint: true });
    await recordStorageVolume({ setting: { upsert } });
    const reading = upsert.mock.calls[0][0];
    expect(reading.where).toEqual({ key: storageVolumeKey });
    expect(recentStorageVolume(reading.create.value)).toEqual({
      availableBytes: expect.stringMatching(/^\d+$/),
      totalBytes: (stats.blocks * stats.bsize).toString(),
      measuredAt: expect.any(String),
    });
  } finally {
    if (previous === undefined) delete process.env.NUVEX_DISK_PATH;
    else process.env.NUVEX_DISK_PATH = previous;
  }
});

test('omite mediciones antiguas, imposibles o dañadas', () => {
  const current = { availableBytes: '50', totalBytes: '100', measuredAt: new Date().toISOString() };
  expect(recentStorageVolume(JSON.stringify(current))).toEqual(current);
  expect(recentStorageVolume(JSON.stringify({ ...current, measuredAt: new Date(Date.now() - 360_000).toISOString() }))).toBeNull();
  expect(recentStorageVolume(JSON.stringify({ ...current, availableBytes: '101' }))).toBeNull();
  expect(recentStorageVolume('{')).toBeNull();
  expect(recentStorageVolume()).toBeNull();
});
