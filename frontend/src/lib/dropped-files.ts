const MAX_FILES = 5_000;
const MAX_DEPTH = 32;

export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!entries.length) return Array.from(dataTransfer.files).slice(0, MAX_FILES);
  const files: File[] = [];
  const state = { count: 0 };
  for (const entry of entries) await readEntry(entry, '', files, 0, state);
  return files;
}

async function readEntry(entry: FileSystemEntry, prefix: string, out: File[], depth: number, state: { count: number }) {
  if (state.count >= MAX_FILES || depth > MAX_DEPTH) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    Object.defineProperty(file, 'webkitRelativePath', { value: prefix + entry.name });
    out.push(file);
    state.count += 1;
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) await readEntry(child, prefix + entry.name + '/', out, depth + 1, state);
  }
}
