import { Module } from '@nestjs/common';
import { CharacterRelationshipsController } from './character-relationships.controller.js';
import { CharacterRelationshipsService } from './character-relationships.service.js';

@Module({
  controllers: [CharacterRelationshipsController],
  providers: [CharacterRelationshipsService],
  exports: [CharacterRelationshipsService],
})
export class CharacterRelationshipsModule {}

