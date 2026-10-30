import crypto from 'crypto';

/**
 * Middleware that attaches a unique request_id to req and sets the X-Request-Id response header.
 */
export function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0 && incomingId.length < 128
      ? incomingId.trim()
      : `req-${crypto.randomBytes(6).toString('hex')}`;

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
