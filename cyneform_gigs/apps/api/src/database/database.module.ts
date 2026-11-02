import { db, pool } from "@cyneform/db/client";
import { Global, Module } from "@nestjs/common";

export const DB_POOL = Symbol("DB_POOL");
export const DB = Symbol("DB");
export type Db = typeof db;

@Global()
@Module({
  providers: [
    { provide: DB_POOL, useValue: pool },
    { provide: DB, useValue: db },
  ],
  exports: [DB, DB_POOL],
})
export class DatabaseModule {}
