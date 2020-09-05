import { ILogger, ILoggerService } from "@connext/types";

export const logTime = (log: ILogger, start: number, msg: string): void => {
  const diff = Date.now() - start;
  const message = `${msg} in ${diff} ms`;
  if (diff < 2) {
    log.debug(message);
  } else if (diff < 200) {
    log.info(message);
  } else {
    log.warn(message);
  }
};

// Example implementation that can be used as a silent default
export const nullLogger: ILoggerService = {
  debug: (msg: string): void => {},
  info: (msg: string): void => {},
  warn: (msg: string): void => {},
  error: (msg: string): void => {},
  setContext: (context: string): void => {},
  newContext: function (context: string): ILoggerService {
    return this;
  },
};

export class ConsoleLogger implements ILoggerService {
  private levels: { [key: string]: number } = { debug: 4, error: 1, info: 3, warn: 2 };
  private context = "UnknownContext";
  private log: ILogger = console;
  public level = 3;

  public constructor(context?: string, level?: number, log?: ILogger) {
    this.context = typeof context !== "undefined" ? context : this.context;
    this.level = typeof level !== "undefined" ? parseInt(level.toString(), 10) : this.level;
    this.log = typeof log !== "undefined" ? log : this.log;
  }

  public setContext(context: string): void {
    this.context = context;
  }

  public newContext(context: string): ConsoleLogger {
    return new ConsoleLogger(context, this.level);
  }

  public error(msg: string): void {
    this.print("error", msg);
  }

  public warn(msg: string): void {
    this.print("warn", msg);
  }

  public info(msg: string): void {
    this.print("info", msg);
  }

  public debug(msg: string): void {
    this.print("debug", msg);
  }

  private print(level: string, msg: string): void {
    if (this.levels[level] > this.level) return;
    this.log[level](`${new Date().toISOString()} [${this.context}] ${msg}`);
  }
}

const colors = {
  Reset: "\x1b[0m",
  Bright: "\x1b[1m",
  Dim: "\x1b[2m",
  Underscore: "\x1b[4m",
  Blink: "\x1b[5m",
  Reverse: "\x1b[7m",
  Hidden: "\x1b[8m",
  FgBlack: "\x1b[30m",
  FgRed: "\x1b[31m",
  FgGreen: "\x1b[32m",
  FgYellow: "\x1b[33m",
  FgBlue: "\x1b[34m",
  FgMagenta: "\x1b[35m",
  FgCyan: "\x1b[36m",
  FgWhite: "\x1b[37m",
  BgBlack: "\x1b[40m",
  BgRed: "\x1b[41m",
  BgGreen: "\x1b[42m",
  BgYellow: "\x1b[43m",
  BgBlue: "\x1b[44m",
  BgMagenta: "\x1b[45m",
  BgCyan: "\x1b[46m",
  BgWhite: "\x1b[47m",
};

export class ColorfulLogger implements ILoggerService {
  private color = true; // flag for turning color on/off
  private colors: { [key: string]: string } = {
    context: colors.FgCyan,
    debug: colors.FgMagenta,
    error: colors.FgRed,
    info: colors.FgGreen,
    warn: colors.FgYellow,
    reset: colors.Reset,
  };
  private context = "UnknownContext";
  private level = 3;
  private levels: { [key: string]: number } = { debug: 4, error: 1, info: 3, warn: 2 };
  private id = "?";

  public constructor(context?: string, level?: number, color?: boolean, id?: string | number) {
    this.context = typeof context !== "undefined" ? context : this.context;
    this.level = typeof level !== "undefined" ? parseInt(level.toString(), 10) : this.level;
    this.color = color || false;
    this.id = id ? id.toString() : "?";
    if (!this.color) {
      this.colors = { context: "", debug: "", error: "", info: "", warn: "", reset: "" };
    }
  }

  public setContext(context: string): void {
    this.context = context;
  }

  public newContext(context: string): ColorfulLogger {
    return new ColorfulLogger(context, this.level, this.color, this.id);
  }

  public error(msg: string): void {
    this.print("error", msg);
  }

  public warn(msg: string): void {
    this.print("warn", msg);
  }

  public info(msg: string): void {
    this.print("info", msg);
  }

  public debug(msg: string): void {
    this.print("debug", msg);
  }

  private print(level: string, msg: string): void {
    if (this.levels[level] > this.level) return;
    const now = new Date().toISOString();
    console[level](
      `${now} ${this.colors[level]}${level.substring(0, 1).toUpperCase()} ` +
        `${this.colors.context}[${this.id}][${this.context}] ` +
        `${this.colors[level]}${msg}${this.colors.reset}`,
    );
  }
}
