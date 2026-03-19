import { Controller, Post, Get, UseInterceptors, UploadedFile, Query, BadRequestException, Logger, Param, Res, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: any, @Query('type') type: string = 'image') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const fileId = uuidv4();
    const originalName = file.originalname;
    const extension = originalName.split('.').pop();
    const fileName = `${fileId}.${extension}`;

    this.logger.log(`Received file: ${originalName} as ${fileName} (Type: ${type})`);

    // Process based on type (image/video)
    if (type === 'video') {
      return await this.mediaService.queueVideoProcessing(file, fileName);
    } else {
      return await this.mediaService.uploadAndProcessImage(file, fileName);
    }
  }

  @Get('info')
  async getMediaInfo(@Query('fileName') fileName: string) {
    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }
    const url = await this.mediaService.getPresignedUrl(fileName);
    return { fileName, url };
  }

  @Get('list')
  async listMedia() {
    return await this.mediaService.listMedia();
  }

  @Post('delete')
  async deleteMedia(@Body('fileName') fileName: string) {
    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }
    return await this.mediaService.deleteMedia(fileName);
  }

  @Get('stream/:folder/:file')
  async streamMedia(@Param('folder') folder: string, @Param('file') file: string, @Res() res: Response) {
    try {
      const stream = await this.mediaService.streamHLS(folder, file);
      
      // Set content type for HLS
      if (file.endsWith('.m3u8')) {
        res.set('Content-Type', 'application/x-mpegURL');
      } else if (file.endsWith('.ts')) {
        res.set('Content-Type', 'video/MP2T');
      }

      stream.pipe(res);
    } catch (error) {
      this.logger.error(`Streaming error: ${error.message}`);
      res.status(404).send('Media not found');
    }
  }
}
