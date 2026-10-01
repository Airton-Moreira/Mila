// Rate Limiting en memoria para Edge Functions (30 peticiones por 10 minutos por usuario)

const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(userId: string, limit = 30, windowMs = 600000): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const userRecord = requestCounts.get(userId);

  if (!userRecord || now > userRecord.resetTime) {
    requestCounts.set(userId, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (userRecord.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  userRecord.count += 1;
  return { allowed: true, remaining: limit - userRecord.count };
}
