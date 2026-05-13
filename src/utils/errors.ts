export class ScreencliError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ScreencliError';
  }
}

export class BrowserError extends ScreencliError {
  constructor(message: string) {
    super(message, 'BROWSER_ERROR');
    this.name = 'BrowserError';
  }
}

export class AgentError extends ScreencliError {
  constructor(message: string) {
    super(message, 'AGENT_ERROR');
    this.name = 'AgentError';
  }
}

export class FFmpegError extends ScreencliError {
  constructor(message: string) {
    super(message, 'FFMPEG_ERROR');
    this.name = 'FFmpegError';
  }
}

export class ExportError extends ScreencliError {
  constructor(message: string) {
    super(message, 'EXPORT_ERROR');
    this.name = 'ExportError';
  }
}

export class ConfigError extends ScreencliError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}
