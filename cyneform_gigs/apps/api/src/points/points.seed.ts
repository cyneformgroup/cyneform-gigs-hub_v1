import { newId } from "@cyneform/db";
import { POINT_RULES, POINT_SCHEMES, SCHEME_DEFAULTS } from "@cyneform/validators";
import type { PoolConnection } from "mysql2/promise";

export async function seedPoints(connection: PoolConnection): Promise<void> {
  for (const scheme of POINT_SCHEMES) {
    await connection.execute("INSERT IGNORE INTO points_schemes (`key`, enabled) VALUES (?, ?)", [
      scheme.key,
      SCHEME_DEFAULTS[scheme.key],
    ]);
  }
  for (const rule of POINT_RULES) {
    await connection.execute(
      "INSERT IGNORE INTO points_rules (`key`, scheme, points, enabled, verification_required) VALUES (?, ?, ?, 1, ?)",
      [rule.key, rule.scheme, rule.defaultPoints, rule.verificationRequired],
    );
  }

  const [countRows] = await connection.execute("SELECT COUNT(*) AS n FROM points_rule_versions");
  const count = (countRows as { n: number }[])[0]?.n ?? 0;
  if (Number(count) === 0) {
    const [ruleRows] = await connection.execute(
      "SELECT `key`, points, enabled, verification_required FROM points_rules",
    );
    const [schemeRows] = await connection.execute("SELECT `key`, enabled FROM points_schemes");
    const rules = Object.fromEntries(
      (
        ruleRows as {
          key: string;
          points: number | string;
          enabled: boolean | number;
          verification_required: boolean | number;
        }[]
      ).map((rule) => [
        rule.key,
        {
          points: Number(rule.points),
          enabled: Boolean(rule.enabled),
          verificationRequired: Boolean(rule.verification_required),
        },
      ]),
    );
    const schemes = Object.fromEntries(
      (schemeRows as { key: string; enabled: boolean | number }[]).map((scheme) => [
        scheme.key,
        Boolean(scheme.enabled),
      ]),
    );
    await connection.execute(
      "INSERT IGNORE INTO points_rule_versions (id, version_no, reason, changed_by, snapshot) VALUES (?, 1, 'Initial defaults', NULL, ?)",
      [newId(), JSON.stringify({ schemes, rules })],
    );
  }
  console.log("[seed] points rules ready");
}
