import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private minioClient: Minio.Client;
  private readonly bucketName: string;

  constructor(private configService: ConfigService) {
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '9000')),
      useSSL: this.configService.get<string>('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.bucketName = this.configService.get<string>('MINIO_BUCKET', 'kasma-media');
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists() {
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName);
        this.logger.log(`Bucket "${this.bucketName}" created successfully.`);
      }
    } catch (error) {
      this.logger.error(`Error checking/creating bucket: ${error.message}`);
    }
  }

  async uploadFile(
    fileName: string,
    fileBuffer: Buffer,
    metaData: any = {},
  ): Promise<string> {
    try {
      await this.minioClient.putObject(
        this.bucketName,
        fileName,
        fileBuffer,
        fileBuffer.length,
        {
          ...metaData,
          'Content-Type': metaData['Content-Type'] || 'application/octet-stream',
        },
      );
      this.logger.log(`File ${fileName} uploaded successfully.`);
      return fileName;
    } catch (error) {
      this.logger.error(`Error uploading file ${fileName}: ${error.message}`);
      throw error;
    }
  }

  async getPresignedUrl(fileName: string, expiry = 3600): Promise<string> {
    try {
      return await this.minioClient.presignedGetObject(
        this.bucketName,
        fileName,
        expiry,
      );
    } catch (error) {
      this.logger.error(`Error generating presigned URL for ${fileName}: ${error.message}`);
      throw error;
    }
  }

  async getFileStream(fileName: string): Promise<any> {
    try {
      return await this.minioClient.getObject(this.bucketName, fileName);
    } catch (error) {
      this.logger.error(`Error getting stream for ${fileName}: ${error.message}`);
      throw error;
    }
  }

  async deleteFile(fileName: string): Promise<void> {
    try {
      await this.minioClient.removeObject(this.bucketName, fileName);
      this.logger.log(`File ${fileName} deleted successfully.`);
    } catch (error) {
      this.logger.error(`Error deleting file ${fileName}: ${error.message}`);
      throw error;
    }
  }

  async listObjects(prefix: string = ''): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const objectsList: any[] = [];
      const stream = this.minioClient.listObjectsV2(this.bucketName, prefix, true);
      
      stream.on('data', (obj) => objectsList.push(obj));
      stream.on('error', (err) => {
        this.logger.error(`Error listing objects with prefix "${prefix}": ${err.message}`);
        reject(err);
      });
      stream.on('end', () => resolve(objectsList));
    });
  }
}
