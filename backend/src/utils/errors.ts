export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required', details?: unknown) {
    return new ApiError(401, 'UNAUTHORIZED', message, details);
  }
  static forbidden(message = 'Forbidden', details?: unknown) {
    return new ApiError(403, 'FORBIDDEN', message, details);
  }
  static notFound(message = 'Not found', details?: unknown) {
    return new ApiError(404, 'NOT_FOUND', message, details);
  }
  static conflict(message = 'Conflict', details?: unknown) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
  static gone(message = 'Expired or already used', details?: unknown) {
    return new ApiError(410, 'GONE', message, details);
  }
  static tooMany(message = 'Too many requests', details?: unknown) {
    return new ApiError(429, 'RATE_LIMITED', message, details);
  }
  static payload(message = 'Payload too large', details?: unknown) {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', message, details);
  }
}
