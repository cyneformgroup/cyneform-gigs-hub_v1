import { type EventJob, QUEUES, redisOptions, Worker } from "@cyneform/queue";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { env } from "../config/env";
import { GigNotifier } from "./gig-notifier.service";

@Injectable()
export class EventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EventsConsumer.name);
  private worker?: Worker<EventJob>;

  constructor(@Inject(GigNotifier) private readonly notifier: GigNotifier) {}

  onModuleInit() {
    this.worker = new Worker<EventJob>(
      QUEUES.events,
      async (job) => {
        if (job.data.type === "lead.published") await this.notifier.announce(job.data.leadIds);
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
