import {
  desc,
  eq,
  pointsRules,
  pointsRuleVersions,
  pointsSchemes,
  sql,
  userProfiles,
} from "@cyneform/db";
import type {
  RestoreVersionInput,
  RulesView,
  RuleVersionItem,
  UpdateRulesInput,
} from "@cyneform/types";
import { POINT_RULES, POINT_SCHEMES, RULE_BY_KEY } from "@cyneform/validators";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, conflict, notFound } from "../common/errors";
import { DB, type Db } from "../database/database.module";

export type Q = Pick<Db, "select" | "insert" | "update">;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type RuleValues = { points: number; enabled: boolean; verificationRequired: boolean };
type Snapshot = { schemes: Record<string, boolean>; rules: Record<string, RuleValues> };

@Injectable()
export class RulesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async latestVersion(q: Q = this.db): Promise<number> {
    const [row] = await q
      .select({ n: sql<number>`coalesce(max(${pointsRuleVersions.versionNo}), 0)` })
      .from(pointsRuleVersions);
    return Number(row?.n ?? 0);
  }

  /** Read one live rule and its scheme switch for the award engine. */
  live(q: Q, key: string) {
    return q
      .select({
        points: pointsRules.points,
        enabled: pointsRules.enabled,
        verificationRequired: pointsRules.verificationRequired,
        schemeEnabled: pointsSchemes.enabled,
      })
      .from(pointsRules)
      .innerJoin(pointsSchemes, eq(pointsSchemes.key, pointsRules.scheme))
      .where(eq(pointsRules.key, key))
      .limit(1)
      .then(([row]) => row ?? null);
  }

  private async current(q: Q): Promise<Snapshot> {
    const rules = await q.select().from(pointsRules);
    const schemes = await q.select().from(pointsSchemes);
    return {
      schemes: Object.fromEntries(schemes.map((scheme) => [scheme.key, scheme.enabled])),
      rules: Object.fromEntries(
        rules.map((rule) => [
          rule.key,
          {
            points: Number(rule.points),
            enabled: rule.enabled,
            verificationRequired: rule.verificationRequired,
          },
        ]),
      ),
    };
  }

  async view(): Promise<RulesView> {
    const current = await this.current(this.db);
    return {
      version: await this.latestVersion(),
      schemes: POINT_SCHEMES.map((scheme) => ({
        ...scheme,
        enabled: current.schemes[scheme.key] ?? false,
      })),
      rules: POINT_RULES.map((definition) => {
        const row = current.rules[definition.key];
        return {
          key: definition.key,
          scheme: definition.scheme,
          group: definition.group,
          label: definition.label,
          defaultPoints: definition.defaultPoints,
          points: row?.points ?? definition.defaultPoints,
          enabled: row?.enabled ?? true,
          verificationRequired: row?.verificationRequired ?? definition.verificationRequired,
          upgradeOf: [...(definition.upgradeOf ?? [])],
        };
      }),
    };
  }

  private async apply(
    tx: Tx,
    baseVersion: number,
    ruleChanges: Record<string, Partial<RuleValues>>,
    schemeChanges: Record<string, boolean>,
    reason: string,
    actor: AuthUser,
    allowNoChange = false,
  ) {
    // The latest version row serializes concurrent edits; version 1 is created by the seed.
    const [latestRow] = await tx
      .select({ versionNo: pointsRuleVersions.versionNo })
      .from(pointsRuleVersions)
      .orderBy(desc(pointsRuleVersions.versionNo))
      .limit(1)
      .for("update");
    const latest = Number(latestRow?.versionNo ?? 0);
    if (baseVersion !== latest)
      throw conflict("RULES_CHANGED", "The rules changed while you were editing. Reload.");

    const before = await this.current(tx);
    const diff: { key: string; from: unknown; to: unknown }[] = [];

    for (const [key, change] of Object.entries(ruleChanges)) {
      const current = before.rules[key];
      if (!RULE_BY_KEY.has(key) || !current)
        throw badRequest("UNKNOWN_RULE", `Unknown rule: ${key}`);
      const next = { ...current, ...change };
      if (JSON.stringify(next) === JSON.stringify(current)) continue;
      await tx
        .update(pointsRules)
        .set({
          points: next.points,
          enabled: next.enabled,
          verificationRequired: next.verificationRequired,
        })
        .where(eq(pointsRules.key, key));
      diff.push({ key, from: current, to: next });
    }

    for (const [key, enabled] of Object.entries(schemeChanges)) {
      if (!POINT_SCHEMES.some((scheme) => scheme.key === key))
        throw badRequest("UNKNOWN_SCHEME", `Unknown scheme: ${key}`);
      if (before.schemes[key] === enabled) continue;
      await tx
        .update(pointsSchemes)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(pointsSchemes.key, key));
      diff.push({ key: `scheme:${key}`, from: before.schemes[key], to: enabled });
    }

    if (diff.length === 0 && !allowNoChange)
      throw badRequest("NO_CHANGE", "You have not changed anything.");
    const versionNo = latest + 1;
    await tx.insert(pointsRuleVersions).values({
      versionNo,
      reason,
      changedBy: actor.id,
      snapshot: JSON.stringify(await this.current(tx)),
    });
    return { versionNo, diff };
  }

  async update(input: UpdateRulesInput, actor: AuthUser, client?: ClientInfo) {
    const out = await this.db.transaction((tx) =>
      this.apply(tx, input.baseVersion, input.rules, input.schemes, input.reason, actor),
    );
    await this.audit.record({
      actor,
      action: "points.rules_updated",
      targetType: "points_rules",
      targetId: String(out.versionNo),
      details: { reason: input.reason, changes: out.diff },
      client,
    });
    return this.view();
  }

  async versions(): Promise<RuleVersionItem[]> {
    const rows = await this.db
      .select({ version: pointsRuleVersions, name: userProfiles.fullName })
      .from(pointsRuleVersions)
      .leftJoin(userProfiles, eq(userProfiles.userId, pointsRuleVersions.changedBy))
      .orderBy(desc(pointsRuleVersions.versionNo))
      .limit(30);
    return rows.map(({ version, name }) => ({
      id: version.id,
      versionNo: version.versionNo,
      reason: version.reason,
      changedByName: name,
      createdAt: version.createdAt.toISOString(),
    }));
  }

  async restore(id: string, input: RestoreVersionInput, actor: AuthUser, client?: ClientInfo) {
    const [version] = await this.db
      .select()
      .from(pointsRuleVersions)
      .where(eq(pointsRuleVersions.id, id))
      .limit(1);
    if (!version) throw notFound("Version not found.");
    const snapshot = JSON.parse(version.snapshot) as Snapshot;
    const ruleChanges: Record<string, RuleValues> = {};
    for (const [key, values] of Object.entries(snapshot.rules)) {
      if (RULE_BY_KEY.has(key)) ruleChanges[key] = values;
    }
    const schemes = Object.fromEntries(
      Object.entries(snapshot.schemes).filter(([key]) => POINT_SCHEMES.some((s) => s.key === key)),
    );
    const out = await this.db.transaction((tx) =>
      this.apply(
        tx,
        input.baseVersion,
        ruleChanges,
        schemes,
        `Restore of v${version.versionNo}: ${input.reason}`.slice(0, 500),
        actor,
        true,
      ),
    );
    await this.audit.record({
      actor,
      action: "points.rules_restored",
      targetType: "points_rules",
      targetId: String(out.versionNo),
      details: { restoredFrom: version.versionNo, reason: input.reason, changes: out.diff },
      client,
    });
    return this.view();
  }
}
