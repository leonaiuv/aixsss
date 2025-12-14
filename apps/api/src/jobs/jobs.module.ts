import { Module } from '@nestjs/common';
import { jobsProviders } from './queue.providers.js';
import { JobsService } from './jobs.service.js';
import { AIJobsController } from './ai-jobs.controller.js';
import { WorkflowController } from './workflow.controller.js';
import { LlmController } from './llm.controller.js';

@Module({
  providers: [...jobsProviders, JobsService],
  controllers: [AIJobsController, WorkflowController, LlmController],
  exports: [JobsService],
})
export class JobsModule {}


