import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { createPool, type Pool } from 'mysql2/promise';
import * as schema from './schema/index.js';
import type { Env } from '../config/env.js';

export const DB_POOL = Symbol('DB_POOL');
export const DB = Symbol('DB');
export type Db = MySql2Database<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Pool =>
        createPool({
          host: config.get('DB_HOST'),
          port: config.get('DB_PORT'),
          user: config.get('DB_USER'),
          password: config.get('DB_PASSWORD'),
          database: config.get('DB_NAME'),
          timezone: 'Z',
          connectionLimit: 10,
          decimalNumbers: false, // money stays an exact string
        }),
    },
    {
      provide: DB,
      inject: [DB_POOL],
      useFactory: (pool: Pool): Db =>
        drizzle(pool, { schema, mode: 'default' }),
    },
  ],
  exports: [DB, DB_POOL],
})
export class DatabaseModule {}
