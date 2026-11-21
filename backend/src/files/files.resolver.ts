import { BadRequestException } from '@nestjs/common';
import { Args, Context, Field, ObjectType, Query as GqlQuery, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { serializeEntry } from './file-entry';
import { FilesService } from './files.service';

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
  ) {
    if (!['files', 'gallery', 'trash'].includes(view)) throw new BadRequestException('Vista inválida.');
    return this.files.list((await this.auth.session(req)).ownerId, parentId, search, view, cursor, sort);
  }

  @GqlQuery(() => FileItem)
  async entry(@Context('req') req: Request, @Args('id', { type: () => String }) id: string) {
    return serializeEntry(await this.files.active((await this.auth.session(req)).ownerId, id));
  }
}
