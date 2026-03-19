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

  async listMedia() {
    // List all objects in the bucket
    const objects = await this.storageService.listObjects();
    
    // Filter out HLS segments and raw files if you want a clean list, 
    // or just return everything. Typically, we want to list "Main" entries.
    // Let's return raw files and root images.
    return objects.filter(obj => !obj.name.includes('/') || obj.name.startsWith('raw/'))
      .map(obj => ({
        name: obj.name,
        size: obj.size,
        lastModified: obj.lastModified,
        type: obj.name.startsWith('raw/') ? 'video' : 'image',
      }));
  }

  async deleteMedia(fileName: string) {
    // Determine if it's a video (in raw/) or image (root)
    const isVideo = fileName.startsWith('raw/') || fileName.endsWith('.mp4') || fileName.endsWith('.mov') || fileName.endsWith('.avi');
    
    if (isVideo) {
      const actualName = fileName.startsWith('raw/') ? fileName.split('/')[1] : fileName;
      const folderName = actualName.split('.')[0];
      
      this.logger.log(`Deleting video: ${actualName} and its HLS folder: hls/${folderName}`);
      
      // 1. Delete raw file
      await this.storageService.deleteFile(`raw/${actualName}`);
      
      // 2. Delete HLS folder content
      const hlsFiles = await this.storageService.listObjects(`hls/${folderName}/`);
      for (const file of hlsFiles) {
        await this.storageService.deleteFile(file.name);
      }
    } else {
      this.logger.log(`Deleting image: ${fileName}`);
      await this.storageService.deleteFile(fileName);
    }

    return { message: `Media ${fileName} deleted successfully` };
  }
}
