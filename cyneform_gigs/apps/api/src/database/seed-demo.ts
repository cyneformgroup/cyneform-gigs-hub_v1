import { createHash } from "node:crypto";
import { and, db, eq, harvestRuns, leadSources, leads, newId, users } from "@cyneform/db";
import { env } from "../config/env";

const sourceName = "Local Demo Gigs";
const demoGigs = [
  {
    title: "Demo: Nairobi product launch event staffing",
    date: new Date("2027-01-15T08:00:00.000Z"),
    venue: "KICC, Nairobi",
    category: "Events",
    url: "https://example.com/local-demo/nairobi-product-launch",
    status: "new" as const,
  },
  {
    title: "Demo: Westlands creative workshop host",
    date: new Date("2027-01-25T08:00:00.000Z"),
    venue: "Westlands, Nairobi",
    category: "Creative",
    url: "https://example.com/local-demo/creative-workshop",
    status: "new" as const,
  },
  {
    title: "Demo: County arts festival vendor coordination",
    date: new Date("2027-02-05T08:00:00.000Z"),
    venue: "Uhuru Gardens, Nairobi",
    category: "Events",
    url: "https://example.com/local-demo/arts-festival",
    status: "pending_review" as const,
  },
];

async function seedDemo() {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.businessEmail, env.SEED_ADMIN_BUSINESS_EMAIL.toLowerCase()))
    .limit(1);
  if (!owner) throw new Error("Run `bun run db:seed` first to create the local admin accounts.");

  const [existing] = await db
    .select()
    .from(leadSources)
    .where(eq(leadSources.name, sourceName))
    .limit(1);
  const sourceId = existing?.id ?? newId();
  const sourceValues = {
    name: sourceName,
    startUrls: JSON.stringify(["https://example.com"]),
    strategy: "jsonld" as const,
    config: JSON.stringify({ strategy: "jsonld" }),
    filters: JSON.stringify({ include: [], exclude: [] }),
    category: "Local demo",
    maxPages: 1,
    schedule: null,
    enabled: false,
    autoPublish: false,
    health: "healthy" as const,
    tosCheckedAt: new Date(),
    tosNote: "Synthetic local fixtures; no external site crawl required.",
    createdBy: owner.id,
  };
  if (existing) await db.update(leadSources).set(sourceValues).where(eq(leadSources.id, sourceId));
  else await db.insert(leadSources).values({ id: sourceId, ...sourceValues });

  const [previousRun] = await db
    .select({ id: harvestRuns.id })
    .from(harvestRuns)
    .where(and(eq(harvestRuns.sourceId, sourceId), eq(harvestRuns.status, "success")))
    .limit(1);
  const runId = previousRun?.id ?? newId();
  if (!previousRun) {
    await db.insert(harvestRuns).values({
      id: runId,
      sourceId,
      trigger: "manual",
      status: "success",
      startedBy: owner.id,
      startedAt: new Date(),
      finishedAt: new Date(),
      pages: 1,
      found: demoGigs.length,
      added: 2,
      rejected: 0,
      duplicates: 0,
      errorCount: 0,
    });
  }

  for (const gig of demoGigs) {
    const fingerprint = createHash("sha256").update(gig.url).digest("hex");
    await db
      .insert(leads)
      .ignore()
      .values({
        id: newId(),
        sourceId,
        runId,
        title: gig.title,
        description: "Synthetic local test opportunity for the CyneForm gigs workflow.",
        clientName: "CyneForm Local Demo",
        venue: gig.venue,
        location: "Nairobi, Kenya",
        category: gig.category,
        startsAt: gig.date,
        eventUrl: gig.url,
        fingerprint,
        contacts: JSON.stringify({ emails: [], phones: [], handles: [], websites: [] }),
        status: gig.status,
        publishedAt: gig.status === "new" ? new Date() : null,
      });
  }

  const rows = await db
    .select({ id: leads.id, title: leads.title, status: leads.status })
    .from(leads)
    .where(eq(leads.sourceId, sourceId));
  console.log(`Local demo source ready: ${sourceName}`);
  for (const row of rows) console.log(`${row.status}: ${row.title} (${row.id})`);
  await db.$client.end();
}

void seedDemo().catch(async (error: unknown) => {
  console.error("Demo seed failed:", error);
  await db.$client.end();
  process.exitCode = 1;
});
