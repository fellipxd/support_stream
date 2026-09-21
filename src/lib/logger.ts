/** Structured JSON logging with secret redaction (docs/SECURITY_MODEL.md T17). */
type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT = [
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'authorization',
  'cookie',
  'secret',
  'sessionsecret',
  'apikey',
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.includes(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (process.env.NODE_ENV !== 'test') console.log(line);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) =>
    process.env.NODE_ENV === 'development' && emit('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
};
