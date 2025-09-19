export enum LogLevel {
  Info = "info",
  Warn = "warn",
  Error = "error",
}

function getTimestamp() {
  return new Date().toISOString();
}

export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
) {
  const logObject = {
    timestamp: getTimestamp(),
    level,
    message,
    ...context,
  };

  switch (level) {
    case LogLevel.Info:
      console.info(JSON.stringify(logObject, null, 2));
      break;
    case LogLevel.Warn:
      console.warn(JSON.stringify(logObject, null, 2));
      break;
    case LogLevel.Error:
      console.error(JSON.stringify(logObject, null, 2));
      break;
    default:
      console.log(JSON.stringify(logObject, null, 2));
  }
}
