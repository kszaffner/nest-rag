import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { VectorStoreModule } from '../vector-store/vector-store.module.js';
import { RagController } from './rag.controller.js';
import { RagService } from './rag.service.js';

@Module({
  imports: [EmbeddingsModule, VectorStoreModule, LlmModule],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
