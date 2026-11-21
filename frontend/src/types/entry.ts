export type Entry = {
  id: string;
  parentId: string;
  name: string;
  kind: string;
  mime: string;
  size: string;
  mediaStatus: string;
  hasPreview: boolean;
  updatedAt: string;
  trashedAt?: string;
};

export type Page = { items: Entry[]; nextCursor?: string };
