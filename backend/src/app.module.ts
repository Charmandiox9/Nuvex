import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request } from 'express';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './files/files.module';
import { SharesModule } from './shares/shares.module';
import { ImportsModule } from './imports/imports.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver, autoSchemaFile: true, graphiql: false,
      introspection: process.env.NODE_ENV !== 'production',
      context: ({ req }: { req: Request }) => ({ req }),
    }),
    HealthModule,
    AuthModule,
    FilesModule,
    SharesModule,
    ImportsModule,
  ],
})
export class AppModule {}
