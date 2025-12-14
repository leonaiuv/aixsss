import { Controller, Get, Param, Post, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { QueueEvents } from 'bullmq';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { JobsService } from './jobs.service.js';
import { Inject } from '@nestjs/common';
import { AI_QUEUE_EVENTS } from './jobs.constants.js';

type ProgressEvent = { jobId: string; data: unknown };
type CompletedEvent = { jobId: string; returnvalue: unknown };
type FailedEvent = { jobId: string; failedReason?: string } & Record<string, unknown>;

@UseGuards(JwtAuthGuard)
@Controller('ai-jobs')
export class AIJobsController {
  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(AI_QUEUE_EVENTS) private readonly queueEvents: QueueEvents,
  ) {}

  @Get(':jobId')
  get(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.jobs.get(user.teamId, jobId);
  }

  @Post(':jobId/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.jobs.cancel(user.teamId, jobId);
  }

  @Sse(':jobId/events')
  async events(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string): Promise<Observable<MessageEvent>> {
    const initial = await this.jobs.get(user.teamId, jobId);

    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ type: 'init', data: initial });

      const onProgress = (payload: ProgressEvent) => {
        if (payload?.jobId !== jobId) return;
        subscriber.next({ type: 'progress', data: { progress: payload.data } });
      };
      const onCompleted = (payload: CompletedEvent) => {
        if (payload?.jobId !== jobId) return;
        subscriber.next({ type: 'completed', data: { result: payload.returnvalue } });
        subscriber.complete();
      };
      const onFailed = (payload: FailedEvent) => {
        if (payload?.jobId !== jobId) return;
        subscriber.next({ type: 'failed', data: { error: payload.failedReason || 'failed' } });
        subscriber.complete();
      };

      this.queueEvents.on('progress', onProgress);
      this.queueEvents.on('completed', onCompleted);
      this.queueEvents.on('failed', onFailed);

      return () => {
        this.queueEvents.off('progress', onProgress);
        this.queueEvents.off('completed', onCompleted);
        this.queueEvents.off('failed', onFailed);
      };
    });
  }
}


