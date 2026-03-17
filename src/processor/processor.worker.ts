import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs-extra';
import * as path from 'path';
import { StorageService } from '../storage/storage.service';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import axios from 'axios';
import { Jimp } from 'jimp';

// Fallback for tfjs-node on Windows
try {
  require('@tensorflow/tfjs-node');
} catch (e) {
  console.log('Running without tfjs-node, using pure JS version');
}

@Processor('media-tasks')
export class ProcessorWorker extends WorkerHost {
  private readonly logger = new Logger(ProcessorWorker.name);
  private model: cocoSsd.ObjectDetection;

  constructor(private readonly storageService: StorageService) {
    super();
    this.initAI();
  }

  async initAI() {
    this.logger.log('Loading AI Model...');
    try {
      await tf.ready();
      this.model = await cocoSsd.load();
      this.logger.log('AI Model loaded successfully');
    } catch (e) {
      this.logger.error(`Failed to load AI model: ${e.message}`);
    }
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { fileName, mimetype } = job.data;
    this.logger.log(`Processing job ${job.id}: ${job.name} for ${fileName}`);

    switch (job.name) {
      case 'process-video':
        return await this.handleVideoHLS(fileName);
      case 'process-image':
        return await this.handleImageAI(fileName);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleVideoHLS(fileName: string) {
    const tempDir = path.join(process.cwd(), 'tmp', fileName.split('.')[0]);
    await fs.ensureDir(tempDir);

    const inputPath = path.join(tempDir, 'input.mp4');
    const outputPath = path.join(tempDir, 'playlist.m3u8');

    try {
      // 1. Get raw file from MinIO (simulated via link or download)
      // For simplicity in this example, we assume we can stream it or we download it
      const presignedUrl = await this.storageService.getPresignedUrl(`raw/${fileName}`);
      
      this.logger.log(`Starting HLS transcoding for ${fileName}`);

      await new Promise((resolve, reject) => {
        ffmpeg(presignedUrl)
          .outputOptions([
            '-profile:v baseline',
            '-level 3.0',
            '-start_number 0',
            '-hls_time 10',
            '-hls_list_size 0',
            '-f hls',
          ])
          .output(path.join(tempDir, 'playlist.m3u8'))
          .screenshots({
            count: 1,
            folder: tempDir,
            filename: 'thumbnail.jpg',
            size: '640x?',
          })
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      this.logger.log(`Transcoding finished. Running AI on extracted frame...`);

      // 2. Run AI on extracted frame
      let aiResult: any = null;
      const thumbnailPath = path.join(tempDir, 'thumbnail.jpg');
      if (await fs.pathExists(thumbnailPath)) {
        const frameBuffer = await fs.readFile(thumbnailPath);
        aiResult = await this.performAIDetection(frameBuffer, 'thumbnail.jpg');
      }

      this.logger.log(`Uploading to MinIO...`);

      // 3. Upload all generated files (.m3u8, .ts, and thumbnail)
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        if (file === 'input.mp4') continue;
        const fileBuffer = await fs.readFile(path.join(tempDir, file));
        await this.storageService.uploadFile(`hls/${fileName.split('.')[0]}/${file}`, fileBuffer, {
          'Content-Type': file.endsWith('.m3u8') ? 'application/x-mpegURL' : 
                          file.endsWith('.jpg') ? 'image/jpeg' : 'video/MP2T',
        });
      }

      this.logger.log(`HLS upload complete for ${fileName}`);
      return { 
        hlsPath: `hls/${fileName.split('.')[0]}/playlist.m3u8`,
        thumbnailPath: `hls/${fileName.split('.')[0]}/thumbnail.jpg`,
        aiResult 
      };
    } catch (error) {
      this.logger.error(`Error processing video: ${error.message}`);
      throw error;
    } finally {
      // 4. Cleanup
      await fs.remove(tempDir);
      this.logger.log(`Cleaned up temp directory: ${tempDir}`);
    }
  }

  private async handleImageAI(fileName: string) {
    try {
      this.logger.log(`Running AI Object Detection for ${fileName}`);
      const presignedUrl = await this.storageService.getPresignedUrl(fileName);
      
      const response = await axios.get(presignedUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);

      const aiResult = await this.performAIDetection(buffer, fileName);
      
      return aiResult;
    } catch (error) {
      this.logger.error(`Error in AI processing: ${error.message}`);
      throw error;
    }
  }

  private async performAIDetection(buffer: any, fileName: string) {
    // Load model if not already loaded
    if (!this.model) {
      await this.initAI();
    }

    let tensor: tf.Tensor3D;
    
    // Decode image
    try {
      if ((tf as any).node && (tf as any).node.decodeImage) {
        tensor = (tf as any).node.decodeImage(buffer, 3) as tf.Tensor3D;
      } else {
        throw new Error('tfjs-node not available');
      }
    } catch (e) {
      this.logger.warn('AI: Using Jimp for decoding image');
      const image: any = await Jimp.read(buffer as any);
      const { width, height } = image.bitmap;
      const data = new Uint8Array(width * height * 3);
      
      let offset = 0;
      image.scan(0, 0, width, height, (x: number, y: number, idx: number) => {
        data[offset++] = image.bitmap.data[idx];     // R
        data[offset++] = image.bitmap.data[idx + 1]; // G
        data[offset++] = image.bitmap.data[idx + 2]; // B
      });

      tensor = tf.tensor3d(data, [height, width, 3], 'int32');
    }

    // Run detection
    const detections = await this.model.detect(tensor);
    
    // Cleanup tensor
    tensor.dispose();

    // Filter for "Main Subject" (highest score)
    const mainSubject = detections.length > 0 
      ? detections.reduce((prev, current) => (prev.score > current.score) ? prev : current)
      : null;

    this.logger.log(`AI Detection finished for ${fileName}. Main subject: ${mainSubject?.class || 'None'} (${mainSubject?.score || 0})`);
    
    return { 
      allDetections: detections,
      mainSubject,
      timestamp: new Date().toISOString(),
      fileName
    };
  }
}
