import { type Db, db, pool } from "@cyneform/db";
import { Global, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";

export const DB = Symbol("DB");
export type { Db };

@Injectable()
class PoolCloser implements OnApplicationShutdown {
  onApplicationShutdown() {
    return pool.end();
  }
}

@Global()
@Module({
  providers: [{ provide: DB, useValue: db }, PoolCloser],
  exports: [DB],
})
export class DatabaseModule {}
