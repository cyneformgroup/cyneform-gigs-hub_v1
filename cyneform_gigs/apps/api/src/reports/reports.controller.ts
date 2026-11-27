import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type { DashboardService } from "./dashboard.service";
import type { AdminReportQueryDto, SubmissionQueryDto, SubmitReportDto } from "./reports.dto";
import type { ReportsService } from "./reports.service";

const send = (res: Response, pdf: Buffer, name: string) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(pdf);
};

@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly dashboard: DashboardService,
  ) {}

  @RequirePermissions("dashboard.view")
  @Get("dashboard")
  summary() {
    return this.dashboard.summary();
  }

  @RequirePermissions("reports.submit_own")
  @Get("reports/weekly/current")
  current(@CurrentUser() actor: AuthUser) {
    return this.reports.current(actor);
  }

  @RequirePermissions("reports.submit_own")
  @Get("reports/weekly/previous-stats")
  previousStats(@CurrentUser() actor: AuthUser) {
    return this.reports.previousStats(actor);
  }

  @RequirePermissions("reports.submit_own")
  @Get("reports/weekly/mine")
  mine(@CurrentUser() actor: AuthUser) {
    return this.reports.mine(actor);
  }

  @RequirePermissions("reports.submit_own")
  @Post("reports/weekly")
  submit(@Body() dto: SubmitReportDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.reports.submit(dto, actor, clientInfo(req));
  }

  @RequirePermissions("reports.view_all")
  @Get("reports/submissions")
  submissions(@Query() q: SubmissionQueryDto) {
    return this.reports.submissions(q.weekStart);
  }

  @RequirePermissions("reports.view_all")
  @Get("reports/admin")
  admin(@Query() q: AdminReportQueryDto) {
    return this.reports.adminReport(q);
  }

  @RequirePermissions("reports.view_all")
  @Get("reports/admin/pdf")
  async adminPdf(@Query() q: AdminReportQueryDto, @Res() res: Response) {
    send(res, await this.reports.adminPdf(q), `report-${q.from}-${q.to}.pdf`);
  }

  @RequirePermissions("reports.view_all")
  @Post("reports/admin/email")
  @HttpCode(204)
  email(@Query() q: AdminReportQueryDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.reports.emailAdminPdf(q, actor, clientInfo(req));
  }

  @RequirePermissions("reports.submit_own")
  @Get("reports/weekly/:id/pdf")
  async pdf(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Res() res: Response,
  ) {
    send(
      res,
      await this.reports.weeklyPdf(id, actor, actor.permissions.has("reports.view_all")),
      `weekly-report-${id.slice(-8)}.pdf`,
    );
  }
  @RequirePermissions("reports.view_all")
  @Get("reports/admin/weekly/:id/pdf")
  async adminWeeklyPdf(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Res() res: Response,
  ) {
    send(res, await this.reports.weeklyPdf(id, actor, true), `weekly-report-${id.slice(-8)}.pdf`);
  }
}
