import { BadRequestException } from '@nestjs/common';
import { Args, Context, Field, ObjectType, Query as GqlQuery, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { serializeEntry } from './file-entry';
import { FilesService } from './files.service';

function parseSize(value: string | undefined, label: string): bigint | undefined {
  if (!value) return undefined;
  try {
    const size = BigInt(value);
    if (size < 0n) throw new Error();
    return size;
  } catch { throw new BadRequestException('Tamaño ' + label + ' inválido.'); }
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Fecha inválida.');
  return date;
}

@ObjectType()
class FileItem {
  @Field() id!: string;
  @Field() parentId!: string;
  @Field() name!: string;
  @Field() kind!: string;
  @Field() mime!: string;
  @Field() size!: string;
  @Field() updatedAt!: string;
  @Field({ nullable: true }) trashedAt?: string;
  @Field() mediaStatus!: string;
  @Field() hasPreview!: boolean;
}

@ObjectType()
class FilePage {
  @Field(() => [FileItem]) items!: FileItem[];
  @Field({ nullable: true }) nextCursor?: string;
}

@Resolver()
export class FilesResolver {
  constructor(private readonly auth: AuthService, private readonly files: FilesService) {}

  @GqlQuery(() => FilePage)
  async entries(
    @Context('req') req: Request,
    @Args('parentId', { type: () => String, defaultValue: '' }) parentId: string,
    @Args('search', { type: () => String, defaultValue: '' }) search: string,
    @Args('view', { type: () => String, defaultValue: 'files' }) view: string,
    @Args('cursor', { type: () => String, nullable: true }) cursor?: string,
    @Args('sort', { type: () => String, defaultValue: 'name' }) sort = 'name',
    @Args('kind', { type: () => String, nullable: true }) kind?: string,
    @Args('mimePrefix', { type: () => String, nullable: true }) mimePrefix?: string,
    @Args('minSize', { type: () => String, nullable: true }) minSize?: string,
    @Args('maxSize', { type: () => String, nullable: true }) maxSize?: string,
    @Args('from', { type: () => String, nullable: true }) from?: string,
    @Args('to', { type: () => String, nullable: true }) to?: string,
  ) {
    if (!['files', 'gallery', 'trash'].includes(view)) throw new BadRequestException('Vista inválida.');
    if (kind && !['file', 'folder'].includes(kind)) throw new BadRequestException('Tipo inválido.');
    const filters = {
      kind: kind || undefined,
      mimePrefix: mimePrefix ? mimePrefix.slice(0, 100) : undefined,
      minSize: parseSize(minSize, 'mínimo'),
      maxSize: parseSize(maxSize, 'máximo'),
      from: parseDate(from),
      to: parseDate(to),
    };
    return this.files.list((await this.auth.session(req)).ownerId, parentId, search, view, cursor, sort, filters);
  }

  @GqlQuery(() => FileItem)
  async entry(@Context('req') req: Request, @Args('id', { type: () => String }) id: string) {
    return serializeEntry(await this.files.active((await this.auth.session(req)).ownerId, id));
  }
}
