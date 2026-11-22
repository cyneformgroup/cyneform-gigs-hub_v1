# Phase 6: Rules and points

## Endpoints

| Method | Endpoint                                    | Permission        | Purpose                               |
| ------ | ------------------------------------------- | ----------------- | ------------------------------------- |
| GET    | `/api/v1/points/rules`                      | `rules.view`      | Current schemes, rules and version    |
| PUT    | `/api/v1/points/rules`                      | `rules.manage`    | Save changed values as a new version  |
| GET    | `/api/v1/points/rules/versions`             | `rules.view`      | Latest 30 versions                    |
| POST   | `/api/v1/points/rules/versions/:id/restore` | `rules.manage`    | Restore a snapshot as a new version   |
| GET    | `/api/v1/points/me`                         | `points.view_own` | Balance, milestones and own ledger    |
| GET    | `/api/v1/points/ledger`                     | `points.view_all` | Filtered ledger                       |
| GET    | `/api/v1/points/bdps`                       | `points.view_all` | Active BDP options for admin forms    |
| GET    | `/api/v1/points/pending`                    | `points.manage`   | Pending verification entries          |
| POST   | `/api/v1/points/award`                      | `points.manage`   | Manually award a catalogue rule       |
| POST   | `/api/v1/points/adjust`                     | `points.manage`   | Add a positive or negative adjustment |
| POST   | `/api/v1/points/:id/verify`                 | `points.manage`   | Verify or reject an entry             |

## Rule catalogue

Workflow defaults on; Layered defaults off. Points and verification requirements are editable in
Points rules.

| Scheme   | Group           | Keys and defaults                                                                                                                                                                                                                             |
| -------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layered  | Initial hook    | `hook_ghosted` 0.5, `hook_response` 1, `hook_call` 2                                                                                                                                                                                          |
| Layered  | Alignment call  | `call_booked` 2, `call_attended` 3, `call_presentation` 4                                                                                                                                                                                     |
| Layered  | Admin handshake | `handshake_followup_booked` 2, `handshake_summary_released` 3, `handshake_strategic_followup` 1                                                                                                                                               |
| Layered  | Field recon     | `field_recon_audit` 5                                                                                                                                                                                                                         |
| Layered  | Deal audit      | `deal_lost_closure` 5                                                                                                                                                                                                                         |
| Workflow | Actions         | `claim` 5, `outreach_sent` 5, `decision_maker` 3, `job_title` 3, `evidence_uploaded` 5, `entry_completed` 10, `followup_1` 10, `followup_2` 10, `followup_3` 10, `deal_won` 20, `deal_lost` 5, `meeting_attendance` 5, `training_completed` 3 |

The layered rules require verification. `hook_response` upgrades `hook_ghosted`, and `hook_call`
upgrades either earlier hook rule; only the difference is awarded for the same gig. Workflow rules
do not require verification by default.

## Decisions

- Both schemes can be edited; only Workflow is enabled initially to avoid overlap and double counting.
- Every save requires a reason and creates a version. Restores create versions too; historical ledger
  values are not recalculated.
- KES per point and expiry days remain in Settings (`points.kes_per_point` and `points.expiry_days`).
- Only claim and outreach-sent events award automatically in this phase. Other catalogue rules are
  available for manual awards.
- Releasing or expiring a gig claim does not claw back claim points. Same-user, same-rule, same-gig
  awards within 24 hours are deduplicated.
- Verification-pending awards do not count in balances until approved. Negative adjustments do not
  expire and cannot take an active balance below zero.
- Expiry pauses for frozen, on-leave and deactivated accounts. On reactivation, active and pending
  expiry dates are extended by the paused duration.

## Later phases and open checks

- CRM, calendar, deals and training automatic triggers, evidence upload, CRM links, duplicate or
  generic outreach detection, rollover, bonuses, reports and leaderboards remain for later phases.
- `meeting_attendance` (5) and `training_completed` (3) follow the supplied Phase 6 prompt. The
  referenced specification PDFs were not present in the project, so confirm those two values against
  the calendar and training sections before go-live.
