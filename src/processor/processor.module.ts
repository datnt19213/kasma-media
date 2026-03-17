import { Module } from '@nestjs/common';
import { ProcessorWorker } from './processor.worker';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [ProcessorWorker],
})
export class ProcessorModule {}
