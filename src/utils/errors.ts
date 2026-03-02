import chalk from 'chalk';

export class EdgexError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'EdgexError';
  }
}

export class ApiError extends EdgexError {
  constructor(code: string, msg: string) {
    super(msg, code);
    this.name = 'ApiError';
  }
}

export class ConfigError extends EdgexError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function handleError(err: unknown): never {
  if (err instanceof EdgexError) {
    const prefix = err.code ? `[${err.code}] ` : '';
    console.error(chalk.red(`Error: ${prefix}${err.message}`));
  } else if (err instanceof Error) {
    console.error(chalk.red(`Error: ${err.message}`));
  } else {
    console.error(chalk.red('An unknown error occurred'));
  }
  process.exit(1);
}
