import { mysqlTable, char, varchar, datetime } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const roles = mysqlTable('roles', {
  id: char('id', { length: 36 }).primaryKey(), // UUIDv7 generated in the app
  name: varchar('name', { length: 50 }).notNull().unique(),
  createdAt: datetime('created_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
});
