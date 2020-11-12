import moment from 'moment-timezone';
import logger from '../../logger';
import {
  deleteElementFromList,
  getListLen,
  getList,
  getRedisHashValue,
  setRedisHashValue,
  deleteRedisHashValue,
  deleteList,
} from '../lib/redis';
import { CALCULATE_ALL_DATA, RECALCULATED } from './job-type';

// const { REDIS_ERROR_KEY } = process.env;

const {
  REDIS_ERROR_KEY,
  TIME_ZONE,
  REDIS_HASH_KEY,
  REDIS_DATA_KEY = 'contractDataList',
} = process.env;

const getErrorList = async (req, res) => {
  const {
    default_issue_time: defaultIssueTime,
    job_type: jobType,
    offset = 0,
    limit = 200,
  } = req.query;

  logger.info(`The request parameters: ${JSON.stringify(req.query)}`);

  if (!defaultIssueTime || defaultIssueTime <= 0) {
    logger.error(`Invalid default issue time`);

    res.json({ code: -1, message: `Invalid default issue time` });

    return;
  }

  if (
    !jobType ||
    (parseInt(jobType, 10) !== CALCULATE_ALL_DATA &&
      parseInt(jobType, 10) !== RECALCULATED)
  ) {
    logger.error(`Invalid job type`);

    res.json({ code: -1, message: `Invalid job type: ${jobType}` });

    return;
  }

  const jobIdPrefix = moment
    .tz(defaultIssueTime * 1000, TIME_ZONE)
    .format('YYYY-MM-DD');

  const defaultIssueDate = `${jobIdPrefix}_${jobType}`;
  const errorListKey = `${REDIS_ERROR_KEY}_${defaultIssueDate}`;
  // const errorList = [];

  logger.info(`Job id: ${defaultIssueDate}, Get error list`);
  const { redis: redisClient } = req;

  try {
    const listLen = await getListLen(errorListKey, redisClient);

    if (listLen !== 0 && !listLen) {
      logger.error(
        `Get error list length failed, errorListKey: ${errorListKey}`
      );

      res.json({
        code: -1,
        error_key: errorListKey,
        message: 'Get error list length failed',
      });

      return;
    }

    const start = parseInt(offset, 10);
    const end = parseInt(offset, 10) + parseInt(limit, 10) - 1;
    const errorList = await getList(errorListKey, start, end, redisClient);

    if (errorList) {
      const newArray = [];

      const obj = {};

      for (let i = 0; i < errorList.length; i += 1) {
        const errorData = JSON.parse(errorList[i]);
        if (!obj[errorData.id]) {
          obj[errorData.id] = errorData;

          newArray.push(errorData);
        } else {
          logger.error(`There is duplicate error data: ${errorData.id}`);
        }
      }

      // logger.info(`The error list: ${JSON.stringify(newArray)}`);
      res.json({ code: 0, total_count: listLen, data: newArray });
    } else {
      res.json({ code: 0, total_count: 0, data: [] });
    }
  } catch (err) {
    logger.error(
      `error_id: ${defaultIssueDate}, Get error list failed, ${err}`
    );

    res.json({
      code: -1,
      error_id_key: defaultIssueDate,
      http_error: `${err}`,
      message: 'Get error list failed',
    });
  }
};

const deleteErrorList = async (req, res) => {
  const { default_issue_time: defaultIssueTime, job_type: jobType } = req.query;
  const { id } = req.params;
  const { id: requestId } = req;

  if (!defaultIssueTime || defaultIssueTime <= 0) {
    logger.error(`Invalid default issue time`);

    res.json({ code: -1, message: `Invalid default issue time` });

    return;
  }

  if (
    !jobType ||
    (parseInt(jobType, 10) !== CALCULATE_ALL_DATA &&
      parseInt(jobType, 10) !== RECALCULATED)
  ) {
    logger.error(`Invalid job type`);

    res.json({ code: -1, message: `Invalid job type: ${jobType}` });

    return;
  }

  const jobIdPrefix = moment
    .tz(defaultIssueTime * 1000, TIME_ZONE)
    .format('YYYY-MM-DD');

  const defaultIssueDate = `${jobIdPrefix}_${jobType}`;
  const errorListKey = `${REDIS_ERROR_KEY}_${defaultIssueDate}`;
  // const errorList = [];

  const { redis: redisClient } = req;
  const errorList = await getList(errorListKey, 0, -1, redisClient);
  // console.log(id);
  // console.log(errorList);
  let element;
  if (errorList.length > 0) {
    element = errorList.find(errorData => JSON.parse(errorData).id === id);
  }

  try {
    const deleteRes = await deleteElementFromList(
      errorListKey,
      element,
      redisClient
    );

    if (deleteRes) {
      const jobData = await getRedisHashValue(
        REDIS_HASH_KEY,
        defaultIssueDate,
        redisClient
      );

      const listLen = await getListLen(errorListKey, redisClient);
      const jobDataJson = JSON.parse(jobData);
      jobDataJson.failed_count = listLen;
      jobDataJson.total_count = jobDataJson.success_count + listLen;

      if (jobDataJson.success_count === 0 && listLen === 0) {
        const deleteJobRes = await deleteRedisHashValue(
          REDIS_HASH_KEY,
          defaultIssueDate,
          redisClient
        );

        if (deleteJobRes) {
          logger.info({
            requestId,
            msg: `Delete Job: ${defaultIssueDate} success`,
          });

          const deleteErrorListRes = await deleteList(
            `${REDIS_ERROR_KEY}_${defaultIssueDate}`,
            redisClient
          );

          if (deleteErrorListRes) {
            logger.info({
              requestId,
              msg: `Delete error list success, jobId: ${defaultIssueDate}`,
            });
          }

          const deleteDataListRes = await deleteList(
            `${REDIS_DATA_KEY}_${defaultIssueDate}`,
            redisClient
          );

          if (deleteDataListRes) {
            logger.info({
              requestId,
              msg: `Delete data list success, jobId: ${defaultIssueDate}`,
            });
          }
        }
      }

      const setResult = await setRedisHashValue(
        REDIS_HASH_KEY,
        defaultIssueDate,
        JSON.stringify(jobDataJson),
        redisClient
      );

      if (setResult) {
        logger.error(
          `Update job ${defaultIssueDate} status failed after waive error data`
        );
      }

      res.json({
        code: 0,
        message: `Delete error element from list, list name: ${errorListKey} success`,
      });

      return;
    }

    logger.error(`Delete element from error list failed`);
    res.json({
      code: -1,
      error_id_key: errorListKey,
      message: 'Delete error list failed',
    });
  } catch (err) {
    logger.error(`error_id: ${errorListKey}, delete error list failed, ${err}`);

    res.json({
      code: -1,
      error_id_key: errorListKey,
      http_error: `${err}`,
      message: 'Delete error list failed',
    });
  }
};

export { getErrorList, deleteErrorList };
