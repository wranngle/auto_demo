import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export const logger = {
  debug(msg: string, data?: unknown): void {
    if (!shouldLog('debug')) return;
    console.error(chalk.gray(`[${timestamp()}] DEBUG ${msg}`), data ?? '');
  },

  info(msg: string, data?: unknown): void {
    if (!shouldLog('info')) return;
    console.error(chalk.blue(`[${timestamp()}] INFO  ${msg}`), data ?? '');
  },

  warn(msg: string, data?: unknown): void {
    if (!shouldLog('warn')) return;
    console.error(chalk.yellow(`[${timestamp()}] WARN  ${msg}`), data ?? '');
  },

  error(msg: string, data?: unknown): void {
    if (!shouldLog('error')) return;
    console.error(chalk.red(`[${timestamp()}] ERROR ${msg}`), data ?? '');
  },
};
