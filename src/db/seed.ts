import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import catalog from "../../seed/catalog.v1.json";
import { catalogTypes } from "./schema";
export async function seedCatalog(db: NodePgDatabase<Record<string, never>>) {
  for (const t of catalog.types) {
    const c = catalog.categories.find((c) => c.code === t.categoryCode)!;
    await db
      .insert(catalogTypes)
      .values({
        code: t.code,
        categoryCode: c.code,
        kind: t.kind,
        nameEn: t.name.en,
        nameBn: t.name.bn,
        categoryEn: c.name.en,
        categoryBn: c.name.bn,
        seedVersion: catalog.version,
      })
      .onConflictDoNothing();
  }
}
