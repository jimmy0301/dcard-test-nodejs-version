import moment from 'moment-timezone';
import logger from '../../logger';
import { INVALID_BILLING_TIME_RANGE } from './error-code';
import { validTimeRange } from '../lib/utils/utils';
import sendDataToBillingEngine from '../lib/data/user';
import {
  CALCULATE_ALL_DATA,
  RECALCULATED,
  RECALCULATED_ERROR,
  RECALCULATED_GEN_ERROR,
  TRANSFER_BILL,
} from './job-type';
import { WHOLE_DATA, NOT_CALCULATE_YET } from './data-type';
import { getRedisHashValue, setRedisHashValue } from '../lib/redis';

const {
  BILLING_ENGINE_PROTOCOL,
  BILLING_ENGINE_HOST,
  BILLING_ENGINE_PORT,
  USER_MAX_COUNT,
  REDIS_HASH_KEY,
  TIME_ZONE,
} = process.env;

const calculateBill = async (req, res) => {
  /* TODO: Get Token from req body */
  const {
    data_type: dataType, // 1: whole data, 2: scooter vin, 3: scooter id, 4: scooter plate, 5: gogoro user id, 6: gogoro user email, 7: es-contract id, 8: Not calculate yet
    cycle_end_day: cycleEndDay,
    billing_period_start: billStart, // timestamp 計費起始日期
    billing_period_end: billEnd, // timestamp 計費截止日期
    billing_cycle_start: billingCycleStart, // billing cycle 起始日
    billing_cycle_end: billingCycleEnd, // billing cycle 截止日
    payment_due_date: dueDate, // 繳費截止日
    job_type: jobType,
    output_type: outputType,
    test,
    default_issue_time: defaultIssueTime,
    bill_issue_date: billDate, // 出帳日
    auto_payment_date: autoPaymentDate,
    ach_upload_date: achUploadDate,
    apply_now: applyNow,
    data,
  } = req.body;
  const { id } = req;

  logger.info({
    requestId: id,
    parameters: req.body,
  });
  let realBillStart = billStart;
  let realBillEnd = billEnd;

  if (billStart === undefined) {
    realBillStart = billingCycleStart;
  }

  if (billEnd === undefined) {
    realBillEnd = billingCycleEnd;
  }

  if (dueDate === undefined || dueDate <= 0) {
    logger.error({ requestId: id, msg: 'Invalid payment due date' });

    res.json({ code: -1, message: `Invalid payment due date` });

    return;
  }

  if (billDate === undefined || billDate <= 0) {
    logger.error({ requestId: id, msg: 'Invalid biill issue date' });

    res.json({ code: -1, message: `Invalid biill issue date` });

    return;
  }

  if (!defaultIssueTime || defaultIssueTime <= 0) {
    logger.error({ requestId: id, msg: 'Invalid default issue time' });

    res.json({ code: -1, message: `Invalid default issue time` });

    return;
  }

  if (dataType !== WHOLE_DATA && dataType !== NOT_CALCULATE_YET && !data) {
    logger.error({ requestId: id, msg: 'Invalid parameter data' });

    res.json({ code: -1, message: `Invalid parameter data` });

    return;
  }

  if (
    !jobType ||
    (parseInt(jobType, 10) !== CALCULATE_ALL_DATA &&
      parseInt(jobType, 10) !== RECALCULATED &&
      parseInt(jobType, 10) !== RECALCULATED_ERROR &&
      parseInt(jobType, 10) !== RECALCULATED_GEN_ERROR &&
      parseInt(jobType, 10) !== TRANSFER_BILL)
  ) {
    logger.error({ requestId: id, msg: 'Invalid job type' });

    res.json({ code: -1, message: `Invalid job type: ${jobType}` });

    return;
  }

  if (
    parseInt(jobType, 10) === CALCULATE_ALL_DATA &&
    (!autoPaymentDate || !achUploadDate)
  ) {
    logger.error({
      requestId: id,
      msg: `Invalid auto payment date ${autoPaymentDate} or ach upload date ${achUploadDate}`,
    });

    res.json({
      code: -1,
      message: `Invalid auto payment date or ach upload date`,
    });

    return;
  }
  if (applyNow !== undefined && applyNow === 1 && jobType !== RECALCULATED) {
    logger.error({
      requestId: id,
      msg: 'Invalid job type for parameter apply_now',
    });

    res.json({
      code: -1,
      message: `Invalid job type: ${jobType} for parameter apply_now: ${applyNow}`,
    });

    return;
  }

  if (
    !validTimeRange(
      billingCycleStart,
      realBillStart,
      billingCycleEnd,
      realBillEnd
    )
  ) {
    logger.error({
      requestId: id,
      msg: 'Invalid time range',
    });

    res.json({
      code: INVALID_BILLING_TIME_RANGE,
      message: `Invalid bill time range`,
    });

    return;
  }

  const { serviceAuth } = req;

  const { redis: client } = req;

  const jobIdPrefix = moment
    .tz(defaultIssueTime * 1000, TIME_ZONE)
    .format('YYYY-MM-DD');

  let newJobType = jobType;

  if (jobType === RECALCULATED_ERROR) {
    newJobType = CALCULATE_ALL_DATA;
  } else if (jobType === RECALCULATED_GEN_ERROR) {
    newJobType = RECALCULATED;
  }

  const defaultIssueDate = `${jobIdPrefix}_${newJobType}`;

  if (jobType === CALCULATE_ALL_DATA || jobType === RECALCULATED) {
    // user bill
    if (!applyNow) {
      logger.info({ requestId: id, msg: 'Check whether the job exists' });
      client.hgetall(REDIS_HASH_KEY, async (err, allJob) => {
        if (err) {
          logger.error({
            requestId: id,
            msg: 'Get the job from redis failed',
            error: err,
          });

          res.json({
            code: -1,
            message: `Get the job from redis failed, ${err}`,
          });
        } else {
          let hasJob = false;
          let jobId = '';
          if (!applyNow) {
            if (allJob !== null) {
              hasJob = true;
              const keysArray = Object.keys(allJob);
              [jobId] = keysArray;
              for (let i = 0; i < keysArray.length; i += 1) {
                if (keysArray[i] === defaultIssueDate) {
                  hasJob = true;
                  jobId = keysArray[i];
                } else {
                  const redisJobType = keysArray[i].split('-')[2];

                  if (parseInt(redisJobType, 10) === jobType) {
                    hasJob = true;
                    jobId = keysArray[i];
                  }
                }
              }
            }
          }

          if (hasJob) {
            logger.error({
              requestId: id,
              msg: `There is a job in redis, job_id: ${jobId}`,
            });

            res.json({
              code: -1,
              message: `There is a job in redis, job_id: ${jobId}`,
            });

            return;
          }

          await sendDataToBillingEngine({
            protocol: BILLING_ENGINE_PROTOCOL,
            host: BILLING_ENGINE_HOST,
            port: BILLING_ENGINE_PORT,
            maxCount: parseInt(USER_MAX_COUNT, 10),
            jobId: defaultIssueDate,
            jobType,
            test,
            billingCycleStart,
            billingCycleEnd,
            billStart,
            billEnd,
            defaultIssueTime,
            dueDate,
            billDate,
            autoPaymentDate,
            achUploadDate,
            cycleEndDay,
            dataType,
            data,
            requestId: req.id,
            serviceAuth,
            res,
            applyNow,
            outputType,
            redisClient: client,
          });
        }
      });
    } else {
      await sendDataToBillingEngine({
        protocol: BILLING_ENGINE_PROTOCOL,
        host: BILLING_ENGINE_HOST,
        port: BILLING_ENGINE_PORT,
        maxCount: parseInt(USER_MAX_COUNT, 10),
        jobId: defaultIssueDate,
        jobType,
        billingCycleStart,
        billingCycleEnd,
        billStart,
        billEnd,
        defaultIssueTime,
        dueDate,
        billDate,
        autoPaymentDate,
        achUploadDate,
        cycleEndDay,
        test,
        dataType,
        requestId: req.id,
        data,
        serviceAuth,
        res,
        applyNow,
        outputType,
        redisClient: client,
      });
    }
  } else if (
    jobType === RECALCULATED_ERROR ||
    jobType === RECALCULATED_GEN_ERROR ||
    jobType === TRANSFER_BILL
  ) {
    if (jobType !== TRANSFER_BILL) {
      logger.info({
        requestId: id,
        msg: 'Check whether the recalculate error job exists',
      });

      const reCalculateErrorJobId = `${defaultIssueDate}_${jobType}`;
      const jobResult = await getRedisHashValue(
        REDIS_HASH_KEY,
        reCalculateErrorJobId,
        client
      );

      if (jobResult) {
        logger.error({
          requestId: id,
          msg: `There is a recalculate error job in redis, job_id: ${reCalculateErrorJobId}`,
        });

        res.json({
          code: -1,
          message: `There is a recalculate error job in redis, job_id: ${reCalculateErrorJobId}`,
        });

        return;
      }

      const jobData = {
        job_type: jobType,
        success_count: 0,
        failed_count: 0,
        total_count: data.length,
      };

      const setJobResult = await setRedisHashValue(
        REDIS_HASH_KEY,
        reCalculateErrorJobId,
        JSON.stringify(jobData),
        client
      );

      logger.info(
        `The set recalculate error job in redis result: ${setJobResult}`
      );
      if (!setJobResult) {
        logger.error(`Create job ${reCalculateErrorJobId} failed`);

        res.json({
          code: -1,
          message: `Create job ${reCalculateErrorJobId} failed`,
        });

        return;
      }
    }

    await sendDataToBillingEngine({
      protocol: BILLING_ENGINE_PROTOCOL,
      host: BILLING_ENGINE_HOST,
      port: BILLING_ENGINE_PORT,
      maxCount: parseInt(USER_MAX_COUNT, 10),
      jobId: defaultIssueDate,
      jobType,
      billingCycleStart,
      billingCycleEnd,
      billStart,
      billEnd,
      defaultIssueTime,
      dueDate,
      billDate,
      autoPaymentDate,
      achUploadDate,
      cycleEndDay,
      dataType,
      data,
      requestId: req.id,
      serviceAuth,
      test,
      res,
      applyNow,
      outputType,
      redisClient: client,
    });
  }
};

export default calculateBill;
