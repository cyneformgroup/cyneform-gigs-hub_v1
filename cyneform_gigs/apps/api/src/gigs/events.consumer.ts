import { type EventJob, QUEUES, redisOptions, Worker } from "@cyneform/queue";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { env } from "../config/env";
import { PointsService } from "../points/points.service";
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
        else if (e.type === "lead.outreach_sent")
          await this.points.award({
            userId: e.userId,
            ruleKey: "outreach_sent",
            leadId: e.leadId,
          });
        else if (e.type === "points.expire") await this.points.expireDue();
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
