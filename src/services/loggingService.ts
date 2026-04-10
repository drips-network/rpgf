import { config } from "../../config.ts";
import {
  bgBrightRed,
  bgRed,
  bgYellow,
  blue,
  bold,
  cyan,
  dim,
  gray,
  green,
  magenta,
  red,
} from "std/fmt/colors";

/**
 * Available log levels, ordered by severity.
 * Uses PascalCase for backwards compat with existing `LogLevel.Info/Warn/Error` call sites.
 */
export enum LogLevel {
  Debug,
  Info,
  Warn,
  Error,
  Critical,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.Debug]: "DEBUG",
  [LogLevel.Info]: "INFO",
  [LogLevel.Warn]: "WARN",
  [LogLevel.Error]: "ERROR",
  [LogLevel.Critical]: "CRITICAL",
};

const CONFIG_LEVEL_MAP: Record<
  "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL",
  LogLevel
> = {
  DEBUG: LogLevel.Debug,
  INFO: LogLevel.Info,
  WARN: LogLevel.Warn,
  ERROR: LogLevel.Error,
  CRITICAL: LogLevel.Critical,
};

export type LogFormatter = (
  level: LogLevel,
  name: string,
  message: string,
  timestamp: Date,
  args: unknown[],
) => string;

const serializeError = (error: Error) => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
});

export const defaultJsonFormatter: LogFormatter = (
  level,
  name,
  message,
  timestamp,
  args,
) => {
  const levelName = LOG_LEVEL_NAMES[level] || "LOG";

  const processedArgs = args.map((arg) => {
    if (arg instanceof Error) {
      return serializeError(arg);
    }
    return arg;
  });

  const logObject = {
    timestamp: timestamp.toISOString(),
    level: levelName,
    name,
    message,
    ...(processedArgs.length > 0 && { data: processedArgs }),
  };

  return JSON.stringify(logObject);
};

export const defaultTextFormatter: LogFormatter = (
  level,
  name,
  message,
  timestamp,
  args,
) => {
  const levelName = LOG_LEVEL_NAMES[level] || "LOG";
  const timeString = timestamp.toISOString();

  let logMessage = `[${timeString}] [${levelName}] [${name}] ${message}`;

  if (args.length > 0) {
    const argsString = args.map((arg) => {
      if (arg instanceof Error) {
        return `Error: ${arg.name}: ${arg.message}\n${arg.stack}`;
      }
      return JSON.stringify(arg);
    }).join(" | ");
    logMessage += ` | Data: ${argsString}`;
  }

  return logMessage;
};

export const colorfulFormatter: LogFormatter = (
  level,
  name,
  message,
  timestamp,
  args,
) => {
  const levelName = LOG_LEVEL_NAMES[level] || "LOG";
  const timeString = timestamp.toLocaleTimeString("en-US", { hour12: false });

  let coloredLevel: string;
  switch (level) {
    case LogLevel.Debug:
      coloredLevel = blue(bold(`[${levelName}]`));
      break;
    case LogLevel.Info:
      coloredLevel = green(bold(`[${levelName}]`));
      break;
    case LogLevel.Warn:
      coloredLevel = bgYellow(bold(` ${levelName} `));
      break;
    case LogLevel.Error:
      coloredLevel = bgRed(bold(` ${levelName} `));
      break;
    case LogLevel.Critical:
      coloredLevel = bgBrightRed(bold(` ${levelName} `));
      break;
    default:
      coloredLevel = bold(`[${levelName}]`);
  }

  const coloredTime = dim(gray(`[${timeString}]`));
  const coloredName = cyan(bold(`[${name}]`));
  const formattedMessage = level >= LogLevel.Error ? red(message) : message;

  let logMessage =
    `${coloredTime} ${coloredLevel} ${coloredName} ${formattedMessage}`;

  if (args.length > 0) {
    const formattedArgs = args.map((arg) => {
      if (arg instanceof Error) {
        return `\n  ${red(bold("Error:"))} ${
          red(arg.name)
        }: ${arg.message}\n  ${dim(gray(arg.stack || ""))}`;
      }
      try {
        return `\n  ${magenta("→")} ${
          JSON.stringify(arg, null, 2).split("\n").join("\n    ")
        }`;
      } catch {
        return `\n  ${magenta("→")} ${String(arg)}`;
      }
    }).join("");
    logMessage += formattedArgs;
  }

  return logMessage;
};

interface LoggerConfig {
  level: LogLevel;
  formatter: LogFormatter;
}

const _config: LoggerConfig = {
  level: LogLevel.Info,
  formatter: defaultJsonFormatter,
};

export function setupLogger(options: Partial<LoggerConfig>) {
  Object.assign(_config, options);
}

/**
 * Named/scoped logger. Prefer instantiating one per module:
 *   const logger = new Logger("my-module");
 *   logger.info("hello", { extra: 1 });
 */
export class Logger {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  private write(level: LogLevel, message: string, ...args: unknown[]) {
    if (level < _config.level) {
      return;
    }

    const formattedMessage = _config.formatter(
      level,
      this.name,
      message,
      new Date(),
      args,
    );

    switch (level) {
      case LogLevel.Debug:
        console.debug(formattedMessage);
        break;
      case LogLevel.Info:
        console.info(formattedMessage);
        break;
      case LogLevel.Warn:
        console.warn(formattedMessage);
        break;
      case LogLevel.Error:
      case LogLevel.Critical:
        console.error(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  public debug(message: string, ...args: unknown[]) {
    this.write(LogLevel.Debug, message, ...args);
  }

  public info(message: string, ...args: unknown[]) {
    this.write(LogLevel.Info, message, ...args);
  }

  public warn(message: string, ...args: unknown[]) {
    this.write(LogLevel.Warn, message, ...args);
  }

  public error(message: string, ...args: unknown[]) {
    this.write(LogLevel.Error, message, ...args);
  }

  public critical(message: string, ...args: unknown[]) {
    this.write(LogLevel.Critical, message, ...args);
  }
}

setupLogger({
  level: CONFIG_LEVEL_MAP[config.logging.level],
  formatter: config.logging.format === "JSON"
    ? defaultJsonFormatter
    : config.logging.format === "COLORFUL"
    ? colorfulFormatter
    : defaultTextFormatter,
});
