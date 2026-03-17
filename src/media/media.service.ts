import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly storageService: StorageService,
    @InjectQueue('media-tasks') private readonly mediaQueue: Queue,
  ) {}

  async uploadAndProcessImage(file: Express.Multer.File, fileName: string) {
    // Upload original image
    await this.storageService.uploadFile(fileName, file.buffer, {
      'Content-Type': file.mimetype,
    });

    // Queue for AI processing (Object Detection)
    const job = await this.mediaQueue.add('process-image', {
      fileName,
      mimetype: file.mimetype,
    });

    return {
      message: 'Image uploaded and queued for AI analysis',
      fileName,
      jobId: job.id,
    };
  }

  async queueVideoProcessing(file: Express.Multer.File, fileName: string) {
    // Upload original video first
    await this.storageService.uploadFile(`raw/${fileName}`, file.buffer, {
      'Content-Type': file.mimetype,
    });

    // Queue for HLS transcoding
    const job = await this.mediaQueue.add('process-video', {
      fileName,
      mimetype: file.mimetype,
    });

    return {
      message: 'Video uploaded and queued for HLS transcoding',
      fileName,
      jobId: job.id,
    };
  }

  async getPresignedUrl(fileName: string) {
    return await this.storageService.getPresignedUrl(fileName);
  }

  async streamHLS(folder: string, file: string) {
    const fileName = `hls/${folder}/${file}`;
    return await this.storageService.getFileStream(fileName);
  }
}
