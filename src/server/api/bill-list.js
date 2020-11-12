import moment from 'moment-timezone';
import logger from '../../logger';
import { getListLen, getList } from '../lib/redis';
import { CALCULATE_ALL_DATA, RECALCULATED } from './job-type';

const { REDIS_DATA_KEY = 'contractDataList', TIME_ZONE } = process.env;

const getBillList = async (req, res) => {
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
  const dataListKey = `${REDIS_DATA_KEY}_${defaultIssueDate}`;

  logger.info(`Job id: ${defaultIssueDate}, Get data list`);
  const { redis: redisClient } = req;

  try {
    const listLen = await getListLen(dataListKey, redisClient);

    if (listLen !== 0 && !listLen) {
      logger.error(`Get data list length failed, dataListKey: ${dataListKey}`);

      res.json({
        code: -1,
        redis_key: dataListKey,
        message: 'Get data list length failed',
      });

      return;
    }

    const start = parseInt(offset, 10);
    const end = parseInt(offset, 10) + parseInt(limit, 10) - 1;
    const dataList = await getList(dataListKey, start, end, redisClient);

    if (dataList) {
      const newArray = [];

      const obj = {};

      for (let i = 0; i < dataList.length; i += 1) {
        const errorData = JSON.parse(dataList[i]);
        if (!obj[errorData.es_contract_id]) {
          obj[errorData.es_contract_id] = errorData;

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

export default getBillList;
