import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { VectorStoreModule } from '../vector-store/vector-store.module.js';
import { IndexingService } from './indexing.service.js';
import { StartupIndexer } from './startup-indexer.js';

@Module({
  imports: [DocumentsModule, EmbeddingsModule, VectorStoreModule],
  providers: [IndexingService, StartupIndexer],
  exports: [IndexingService],
})
export class IndexingModule {}
