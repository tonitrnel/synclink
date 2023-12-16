enum LogLevel {
  // Fatal = 0,
  ERROR = 1,
  WARN,
  INFO,
  DEBUG,
  TRACE,
}

interface LogObject {
  level: keyof typeof LogLevel;
  time: number;
  path: string;
  name: string;
  message: string;
  stack: string;
}

interface ReportOptions {
  interval: number;
  size: number;
}

class Report {
  private static queue: LogObject[] = [];
  private static lastReportTime = 0;
  private static launched = false;
  static options: ReportOptions = {
    interval: 300_000, // 5 minutes
    size: 100,
  };

  static parseLevel(level: string): LogLevel | undefined {
    return Reflect.get(LogLevel, level.toLowerCase());
  }

  static report() {
    if (document.visibilityState == 'visible') return void 0;
    const logs = this.queue
      .splice(0, this.queue.length)
      .filter((it) => LogLevel[it.level] <= LogLevel.INFO);
    // .filter((it) => (this.parseLevel(it.level) ?? 0) >= LogLevel.DEBUG);
    if (logs.length === 0) return void 0;
    const now = Date.now();
    const report = {
      logs,
      time: now,
      system: {
        userAgent: navigator.userAgent.toLowerCase(),
        height: window.innerHeight,
        width: window.innerWidth,
      },
      build: {
        version: __VERSION,
        timestamp: __BUILD_TIMESTAMP,
      },
    };
    this.lastReportTime = now;
    navigator.sendBeacon(`${__ENDPOINT}/api/beacon`, JSON.stringify(report));
  }

  static launch() {
    if (this.launched) return void 0;
    this.launched = true;
    this.lastReportTime = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.report();
    });
    window.addEventListener('error', (err) => {
      this.push(LogLevel.ERROR, 'window', err.message, err);
    });
    window.addEventListener('unhandledrejection', (err) => {
      this.push(LogLevel.ERROR, 'window', err.reason, err);
    });
  }

  static push(level: LogLevel, name: string, ...messages: unknown[]) {
    const stack = new Error().stack;
    const log: LogObject = {
      level: LogLevel[level] as keyof typeof LogLevel,
      name,
      time: Date.now(),
      path: window.location.pathname + window.location.search,
      stack:
        stack
          ?.split('\n')
          .slice(3)
          .map((it) => it.replace(location.origin, ''))
          .join('\n') || '',
      message: messages
        .map((it) => {
          const result = (() => {
            if (typeof it === 'object') {
              try {
                return JSON.stringify(it);
              } catch (e) {
                return String(it) || '{}';
              }
            }
          })();
          return !result || result === '{}' ? String(it) : result;
        })
        .join(' '),
    };
    this.queue.push(log);
    if (
      Date.now() - this.lastReportTime > this.options.interval ||
      this.queue.length > this.options.size ||
      level >= LogLevel.WARN
    ) {
      this.report();
    }
  }
}

export class Logger {
  private readonly level: LogLevel;

  constructor(public readonly name: string, level?: LogLevel) {
    if (!level) {
      const _level = localStorage.getItem('__LOG_LEVEL') || void 0;
      if (_level && Reflect.has(LogLevel, _level)) {
        this.level = /\d/.test(_level)
          ? parseInt(_level)
          : LogLevel[_level as keyof typeof LogLevel];
      } else {
        this.level = LogLevel.WARN;
      }
    } else {
      this.level = level;
    }
    Report.launch();
  }
  public info = (...message: unknown[]) => {
    Report.push(LogLevel.INFO, this.name, ...message);
    if (this.level < LogLevel.INFO) return void 0;
    console.info(`${this.name}:`, ...message);
  };
  public warn = (...message: unknown[]) => {
    Report.push(LogLevel.WARN, this.name, ...message);
    if (this.level < LogLevel.WARN) return void 0;
    console.warn(`${this.name}:`, ...message);
  };
  public error = (...message: unknown[]) => {
    Report.push(LogLevel.ERROR, this.name, ...message);
    if (this.level < LogLevel.ERROR) return void 0;
    console.error(`${this.name}:`, ...message);
  };
  public debug = (...message: unknown[]) => {
    Report.push(LogLevel.DEBUG, this.name, ...message);
    if (this.level < LogLevel.DEBUG) return void 0;
    console.debug(`${this.name}:`, ...message);
  };
  public trace = (...message: unknown[]) => {
    Report.push(LogLevel.TRACE, this.name, ...message);
    if (this.level < LogLevel.TRACE) return void 0;
    console.trace(`${this.name}:`, ...message);
  };
}
