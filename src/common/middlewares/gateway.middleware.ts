import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class GatewayMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'];
    if (requestId) {
      (req as any).id = requestId;
      res.setHeader('X-Request-Id', requestId);
    }
    
    const userId = req.headers['x-user-id'];
    if (userId && !(req as any).user) {
      (req as any).user = { id: userId as string };
    }
    
    next();
  }
}
