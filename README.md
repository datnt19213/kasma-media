# Kasma Media Microservice

Microservice specialized in Media (Images, Video) processing and self-hosted storage.

## Key Features

- **Storage**: Uses MinIO (S3 SDK) with Private mode by default.
- **Transcoding**: Converts MP4 to HLS (.m3u8) to support adaptive streaming.
- **AI Analytics**: Automated object detection in images and video frames using TensorFlow.js (COCO-SSD).
- **Security**: File access via Pre-signed URLs (Timed-access).
- **HLS Proxy**: Built-in streaming proxy for Web and Mobile players without exposing storage.
- **Cleanup**: Automatic cleanup of temporary files after processing.

## System Requirements

- Redis (for BullMQ)
- MinIO (for Storage)
- FFmpeg (pre-installed in Docker image)

## Setup Guide

```bash
# Install dependencies
yarn install

# Run in development mode
yarn dev

# Build Docker image
docker build -t kasma-media .

# Run with Docker Compose
docker-compose up --build
```

## API Endpoints

The service runs on port **9000** and uses global prefix `api/v1`.

### 1. Upload Media

- **URL**: `POST /api/v1/media/upload?type=video|image`
- **Body**: `file` (Multipart/form-data)
- **Response**: Returns `jobId` and `fileName`.

### 2. Get Media Info

- **URL**: `GET /api/v1/media/info?fileName=...`
- **Response**: Returns a Pre-signed URL for the original file.

### 2.1 AI Object Detection (Tracking)

The system integrates AI to automatically analyze media:

- **Images**: Analyzed immediately after upload to find the main subject.
- **Video**: Automatically extracts frames (thumbnails) during HLS transcoding and runs AI to identify the "Main Subject" based on the highest confidence score.
- **Result**: Includes all detections and a highlighted "Main Subject".

### 3. Stream HLS Video

- **URL**: `GET /api/v1/media/stream/:folder/:file`
- **Description**: Proxy for streaming video segments (.ts) and playlists (.m3u8).
- **Usage**: Provide the `.m3u8` URL to players (Video.js, HLS.js, ExoPlayer).
- **Example**: `http://localhost:9000/api/v1/media/stream/video_uuid/playlist.m3u8`

## Streaming Support (Web/App)

The system uses the **HLS (HTTP Live Streaming)** standard:

1. **Web**: Compatible with `hls.js`, `Video.js`, or `Plyr`.
2. **Mobile (App)**:
   - Android: Use `ExoPlayer`.
   - iOS: Native support via `AVPlayer`.
3. **Benefits**:
   - Adaptive Bitrate support.
   - Chunk-based loading (saves bandwidth).
   - Enhanced Security: MinIO files remain private, accessible only through the Kasma-media Proxy.

## Environment Variables

- `MINIO_ENDPOINT`: MinIO server address.
- `MINIO_PORT`: Port (default 9000).
- `MINIO_ACCESS_KEY`: Access Key.
- `MINIO_SECRET_KEY`: Secret Key.
- `MINIO_BUCKET`: Target bucket name.
- `REDIS_HOST`: Redis address.
- `REDIS_PORT`: Redis port.
- `PORT`: Service port (default 9000).
