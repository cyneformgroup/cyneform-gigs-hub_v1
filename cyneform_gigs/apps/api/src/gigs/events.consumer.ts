import { type EventJob, QUEUES, redisOptions, Worker } from "@cyneform/queue";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { AccountsService } from "../automation/accounts.service";
import { LifecycleService } from "../automation/lifecycle.service";
import { OpsService } from "../automation/ops.service";
import { PrivacyService } from "../automation/privacy.service";
import { CalendarService } from "../calendar/calendar.service";
import { CompensationService } from "../compensation/compensation.service";
import { env } from "../config/env";
import { CrmService } from "../crm/crm.service";
import { PointsService } from "../points/points.service";
import { ReportsService } from "../reports/reports.service";
import { BonusService } from "../rewards/bonus.service";
import { EquityService } from "../rewards/equity.service";
import { ClaimsService } from "./claims.service";
import { GigNotifier } from "./gig-notifier.service";

@Injectable()
export class EventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EventsConsumer.name);
  private worker?: Worker<EventJob>;

  constructor(
    @Inject(GigNotifier) private readonly notifier: GigNotifier,
    @Inject(ClaimsService) private readonly claims: ClaimsService,
    @Inject(PointsService) private readonly points: PointsService,
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(CompensationService) private readonly compensation: CompensationService,
    @Inject(BonusService) private readonly bonus: BonusService,
    @Inject(EquityService) private readonly equity: EquityService,
    @Inject(CalendarService) private readonly calendar: CalendarService,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject(OpsService) private readonly ops: OpsService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<EventJob>(
      QUEUES.events,
      async (job) => {
        const e = job.data;
        if (e.type === "lead.published") await this.notifier.announce(e.leadIds);
        else if (e.type === "claims.sweep") await this.claims.sweepExpired();
        else if (e.type === "lead.claimed")
          await this.points.award({ userId: e.userId, ruleKey: "claim", leadId: e.leadId });
        else if (e.type === "lead.outreach_sent") {
          await this.points.award({ userId: e.userId, ruleKey: "outreach_sent", leadId: e.leadId });
          await this.crm.awardQualityForLead(e.userId, e.leadId, "hook_ghosted");
        } else if (e.type === "crm.reminders") await this.crm.remindDue();
        else if (e.type === "crm.followup") await this.crm.sendFollowup(e.entryId, e.n);
        else if (e.type === "compensation.expire") await this.compensation.expireRollover();
        else if (e.type === "points.expire") await this.points.expireDue();
        else if (e.type === "bonus.check") await this.bonus.weeklyCheck();
        else if (e.type === "bonus.process") await this.bonus.processQueued();
        else if (e.type === "equity.daily") await this.equity.dailyVesting();
        else if (e.type === "calendar.reminder") await this.calendar.remind(e.meetingId);
        else if (e.type === "reports.remind") await this.reports.remind();
        else if (e.type === "reports.overdue") await this.reports.overdue();
        else if (e.type === "automation.inactivity") await this.lifecycle.inactivity();
        else if (e.type === "automation.vault") await this.lifecycle.vault();
        else if (e.type === "automation.leave") await this.lifecycle.leave();
        else if (e.type === "automation.anonymize") await this.accounts.anonymizeDue();
        else if (e.type === "privacy.due") await this.privacy.dueReminders();
        else if (e.type === "ops.cleanup") await this.ops.cleanup();
      },
      { connection: redisOptions(env.REDIS_URL, "worker"), concurrency: 1 },
    );
    this.worker.on("failed", (job, err) =>
      this.log.error(`Event ${job?.name} failed: ${err.message}`),
    );
    this.worker.on("error", (err) => this.log.error(`Events worker error: ${err.message}`));
  }

  onModuleDestroy() {
    return this.worker?.close();
  }
}
