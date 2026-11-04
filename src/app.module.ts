import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DocumentsModule } from './documents/documents.module.js';
import { EmbeddingsModule } from './embeddings/embeddings.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DocumentsModule,
    EmbeddingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
