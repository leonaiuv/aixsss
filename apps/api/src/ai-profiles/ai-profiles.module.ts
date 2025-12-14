import { Module } from '@nestjs/common';
import { AIProfilesController } from './ai-profiles.controller.js';
import { AIProfilesService } from './ai-profiles.service.js';
import { ApiKeyCryptoService } from '../crypto/api-key-crypto.service.js';

@Module({
  controllers: [AIProfilesController],
  providers: [AIProfilesService, ApiKeyCryptoService],
})
export class AIProfilesModule {}


