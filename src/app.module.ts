import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DocumentsModule } from './documents/documents.module.js';
import { EmbeddingsModule } from './embeddings/embeddings.module.js';
import { IndexingModule } from './indexing/indexing.module.js';
import { LlmModule } from './llm/llm.module.js';
import { RagModule } from './rag/rag.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DocumentsModule,
    EmbeddingsModule,
    IndexingModule,
    LlmModule,
    RagModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
