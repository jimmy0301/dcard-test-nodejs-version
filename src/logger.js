import pino from 'pino';
import pinoExpress from 'express-pino-logger';
import moment from 'moment';
import chalk from 'chalk';

const DATE_FORMAT = 'HH:mm:ss.SSSZ';

const { NODE_ENV } = process.env;
const isNonProduction = NODE_ENV === 'development';

const color = new chalk.constructor({ enabled: isNonProduction });

const LEVELS = {
  default: 'USERLVL',
  60: 'FATAL',
  50: 'ERROR',
  40: 'WARN',
  30: 'INFO',
  20: 'DEBUG',
  10: 'TRACE',
};

const coloredLevel = {
  default: color.white,
  60: color.bgRed,
  50: color.red,
  40: color.yellow,
  30: color.green,
  20: color.blue,
  10: color.grey,
};

function colorLevel(level) {
  return level in coloredLevel
    ? coloredLevel[level](LEVELS[level])
    : coloredLevel.default(LEVELS[level]);
}

function isObject(input) {
  return Object.prototype.toString.apply(input) === '[object Object]';
}

function isPinoLog(log) {
  return log && (Object.prototype.hasOwnProperty.call(log, 'v') && log.v === 1);
}

function checkPinoLog(inputData) {
  let logObject;

  if (typeof inputData === 'string') {
    const parsedData = JSON.parse(inputData);
    logObject = isPinoLog(parsedData) ? parsedData : undefined;
  } else if (isObject(inputData) && isPinoLog(inputData)) {
    logObject = inputData;
  }
  return logObject;
}

const prettifyLog = () => {
  return inputData => {
    Object.assign(inputData, { v: 1 });
    const logObject = checkPinoLog(inputData);
    if (!logObject) return inputData;

    const {
      hostname,
      pid,
      method,
      time: timestamp,
      url,
      name: label,
      level,
      res: { status, statusText, data: resData /* params */ } = {},
      user,
      data,
      parameters,
      responseTime,
      msg,
      req,
      res,
      requestId,
      // sessionUserId,
      error,
    } = logObject;

    const time = moment(timestamp).format(`YYYY-MM-DD ${DATE_FORMAT}`);
    const request = method
      ? `${color.greenBright(method.toUpperCase())} ${url}`
      : '';

    const log = `[${color.gray(time)}] [${hostname}:${pid}] ${
      requestId ? `[${requestId}]` : ``
    } ${label ? `${[color.blue(label)]} ` : ''}[${colorLevel(level)}] ${
      error ? `${[error.stack]}` : ''
    } ${user ? `${[color.yellowBright(user.username)]} ` : ''}${
      status ? `${color.cyanBright(status)} ` : ''
    }${status ? `${color.cyanBright(statusText)} ` : ''}${
      responseTime ? `${responseTime} ms ` : ''
    }${status ? `(${request}) ` : request}${msg ? `${msg} ` : ''}${
      parameters ? color.dim(`\nParams:\n${JSON.stringify(parameters)} `) : ''
    }${
      resData || data
        ? color.dim(`\nData:\n${JSON.stringify(resData || data)} `)
        : ''
    } ${req && res ? `\n${JSON.stringify({ req, res }, null, 2)}` : ''}\n`;
    return log;
  };
};

export const createAPIClientLogger = name =>
  pino({
    name,
    redact: {
      paths: ['headers.Authorization', 'httpAgent', 'httpsAgent'],
      censor: '***',
    },
    prettyPrint: isNonProduction,
    prettifier: prettifyLog,
  });

export const gpLogger = createAPIClientLogger('go-platform');

export const apiLogger = pinoExpress({
  logger: pino({
    name: 'api',
    prettyPrint: isNonProduction,
    prettifier: prettifyLog,
  }),
});

export default pino({
  name: 'server',
  prettyPrint: isNonProduction,
  prettifier: prettifyLog,
});
