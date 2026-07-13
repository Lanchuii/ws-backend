import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseObj = exception.getResponse() as any;
      message = responseObj?.message || exception.message;
      errors = responseObj?.errors || null;
    }

    // 🚀 Structured logging
    this.logger.error({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.url,
      message,
      status,
      stack: exception instanceof Error ? exception.stack : exception,
    });

    response.status(status).json({
      success: false,
      message,
      errors,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
