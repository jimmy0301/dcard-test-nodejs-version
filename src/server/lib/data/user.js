import logger from '../../../logger';
import { genBillingEngineUrl } from '../utils/utils';
import {
  updateJobStatus,
  setRedisHashValue,
  deleteRedisHashValue,
  getRedisHashValue,
} from '../redis';
import {
  NOT_CALCULATE_YET,
  SCOOTER_VIN,
  SCOOTER_ID,
  SCOOTER_PLATE,
  GOGORO_USER_ID,
  GOGORO_USER_EMAIL,
} from '../../api/data-type';
import {
  CALCULATE_ALL_DATA,
  RECALCULATED,
  TRANSFER_BILL,
  RECALCULATED_ERROR,
  RECALCULATED_GEN_ERROR,
  jobTypeMapping,
} from '../../api/job-type';
import { NO_BILL_TO_CALCULATE } from '../../api/error-code';
import { searchESContract } from './contract';
import calculateAllBill from '../job/calculateAllBill';
import calculateHotBill from '../job/calculateHotBill';
import calculateErrorBill from '../job/calculateErrorBill';
import calculatePartialBill from '../job/calculatePartialBill';

const {
  REDIS_HASH_KEY,
  REDIS_DATA_KEY = 'contractDataList',
  // CONCURRENT_NUM,
  REDIS_ERROR_KEY,
  PAGINATION_LIMIT = 200,
} = process.env;

const SUCCESS = 0;
const PROCESS = 2;
const CALCULATED = 3;

const ACTIVATED = 1;
const TERMINATED = 3;
const TRANSFER = 4;

const sendDataToBillingEngine = async ({
  protocol,
  host,
  port,
  maxCount,
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
  serviceAuth,
  requestId,
  jobId,
  test,
  jobType,
  data,
  res,
  applyNow,
  outputType,
  redisClient,
}) => {
  let createJob = false;
  let resultJSON = null;
  // let errorList = [];
  const protocolArr = protocol.split(',');
  const hostArr = host.split(',');
  const portArr = port.split(',');
  const billingEngineUrlArr = genBillingEngineUrl(
    protocolArr,
    hostArr,
    portArr
  );
  let billingUrl = `${billingEngineUrlArr[0]}/es-contract/bill`;

  if (jobType === CALCULATE_ALL_DATA || jobType === RECALCULATED) {
    const jobData = {
      data_type: dataType,
      job_type: jobType,
      status: PROCESS,
      success_count: 0,
      failed_count: 0,
      pending_approved_count: 0,
      total_count: 0,
      approved_count: 0,
      billing_cycle_start: billingCycleStart, // billing cycle 起始日
      billing_cycle_end: billingCycleEnd, // billing cycle 截止日
      payment_due_date: dueDate, // 繳費截止日
      bill_issue_date: billDate, // 出帳日
      default_issue_time: defaultIssueTime,
      auto_payment_date: autoPaymentDate,
      ach_upload_date: achUploadDate,
    };

    logger.info({
      requestId,
      msg: `The job: ${jobTypeMapping[jobType]} start to handle`,
    });
    let redisSetResult = '';

    if (!applyNow) {
      try {
        redisSetResult = await setRedisHashValue(
          REDIS_HASH_KEY,
          jobId,
          JSON.stringify(jobData),
          redisClient
        );

        createJob = true;
        console.log(redisSetResult);
      } catch (err) {
        logger.error({ requestId, msg: 'Set redis failed', error: err });

        res.json({
          code: -1,
          job_type: jobTypeMapping[jobType],
          http_error: `${err}`,
          message: 'Set redis failed',
        });

        return;
      }
    }
  } else if (jobType !== TRANSFER_BILL && !applyNow) {
    const result = await getRedisHashValue(REDIS_HASH_KEY, jobId, redisClient);

    if (result) {
      resultJSON = JSON.parse(result);

      res.json({ code: 0, message: 'success' });
    } else {
      logger.error({
        requestId,
        msg: `There is no job, jobType: ${jobTypeMapping[jobType]}, jobId: ${jobId}`,
      });

      res.json({
        code: -1,
        job_id: jobId,
        job_type: jobTypeMapping[jobType],
        message: 'There is no job',
      });

      return;
    }
  }

  let totalBills = 0;

  const billDateInfo = {
    billing_period_start:
      billStart === undefined ? billingCycleStart : billStart,
    billing_period_end: billEnd === undefined ? billingCycleEnd : billEnd,
    payment_due_date: dueDate,
    bill_issue_date: billDate,
    billing_cycle_start: billingCycleStart,
    billing_cycle_end: billingCycleEnd,
    default_issue_time: defaultIssueTime,
    auto_payment_date: autoPaymentDate,
    ach_upload_date: achUploadDate,
    cycle_end_day: cycleEndDay,
  };

  if (
    jobType === CALCULATE_ALL_DATA ||
    (jobType === RECALCULATED && dataType === NOT_CALCULATE_YET)
  ) {
    const searchReq = {
      cycle_end_day: billDateInfo.cycle_end_day,
      contract_time_from: billDateInfo.billing_cycle_start,
      contract_time_to: billDateInfo.billing_cycle_end,
      latest_bill_calc_end_date_to: billDateInfo.billing_cycle_end - 1,
      status_list: [ACTIVATED, TERMINATED, TRANSFER],
      sort_flag: [1],
      pagination_criteria: {
        offset: 0,
        limit: maxCount,
      },
    };

    // const searchResult = await searchESContract(searchReq, serviceAuth);
    // const originalRequest = searchReq;

    // logger.info({
    //   requestId,
    //   msg: 'The original request',
    //   parameters: originalRequest,
    // });
    searchReq.latest_bill_calc_end_date_to = billDateInfo.billing_cycle_end - 1;

    logger.info({
      requestId,
      msg: 'The filter request',
      parameters: searchReq,
    });
    const filterDataResult = await searchESContract(searchReq, serviceAuth);

    // if (searchResult.code !== SUCCESS) {
    //   res.json({ code: -1, message: 'Get first es-contract list failed' });

    //   try {
    //     await deleteRedisHashValue(REDIS_HASH_KEY, jobId, redisClient);
    //   } catch (error) {
    //     logger.error({
    //       requestId,
    //       error,
    //       msg: 'Delete job failed for getting first es-contract failed',
    //     });
    //   }

    //   return;
    // }

    // if (searchResult.totalCount <= 0) {
    //   logger.info({
    //     requestId,
    //     msg: 'There is no bill to calculate for total search',
    //   });

    //   res.json({
    //     code: NO_BILL_TO_CALCULATE,
    //     message: 'There is no bill to calculate',
    //   });

    //   return;
    // }

    if (filterDataResult.code !== SUCCESS) {
      res.json({
        code: -1,
        message: 'Get first filter es-contract list failed',
      });

      try {
        await deleteRedisHashValue(REDIS_HASH_KEY, jobId, redisClient);
      } catch (error) {
        logger.error({
          requestId,
          error,
          msg: 'Delete job failed for getting first es-contract failed',
        });
      }

      return;
    }

    if (filterDataResult.totalCount <= 0) {
      logger.info({
        requestId,
        msg: 'There is no bill to calculate for filter search',
      });

      res.json({
        code: NO_BILL_TO_CALCULATE,
        message: 'There is no bill to calculate for filtering result',
      });

      return;
    }

    if (createJob) {
      const updateResult = await updateJobStatus(
        REDIS_HASH_KEY,
        jobId,
        {
          total_count: filterDataResult.totalCount,
        },
        redisClient
      );

      if (!updateResult) {
        logger.error({
          requestId,
          msg: `Update job id ${jobId} total count failed`,
        });

        res.json({
          code: -1,
          job_id: jobId,
          message: `Update job total count failed`,
        });

        return;
      }
    }

    res.json({ code: 0, message: 'Success' });

    logger.info({
      requestId,
      msg: `Total es-contract: ${filterDataResult.totalCount}`,
    });
    const numberOfTimes = Math.ceil(
      filterDataResult.totalCount / parseFloat(PAGINATION_LIMIT, 10)
    );

    const startOffIndex = [];

    for (let i = 0; i < numberOfTimes; i += 1) {
      startOffIndex.push(i * parseInt(PAGINATION_LIMIT, 10));
    }

    logger.info({
      requestId,
      msg: `The start of Index: ${JSON.stringify(startOffIndex)}`,
    });
    logger.info({
      requestId,
      msg: `Number of request times to get es-contract: ${numberOfTimes}`,
    });

    await calculateAllBill({
      startOffIndex,
      billingUrl,
      dataType,
      jobId,
      jobType,
      billDateInfo,
      maxCount: parseInt(PAGINATION_LIMIT, 10),
      statusList: [ACTIVATED, TRANSFER, TERMINATED],
      redisClient,
      requestId,
      errorListKey: `${REDIS_ERROR_KEY}_${jobId}`,
      dataListKey: `${REDIS_DATA_KEY}_${jobId}`,
      outputType,
      serviceAuth,
    });

    await updateJobStatus(
      REDIS_HASH_KEY,
      jobId,
      {
        status: CALCULATED,
      },
      redisClient
    );
  } else {
    totalBills = data.length;

    if (totalBills <= 0) {
      logger.info({
        requestId,
        msg: `There is no data to generate bill at this billing cycle ${billDateInfo.billing_cycle_start} ~ ${billDateInfo.billing_cycle_end}`,
      });

      if (jobType === TRANSFER_BILL || applyNow) {
        res.json({
          code: -1,
          message: 'There is no data to generate bill at this billing cycle',
        });
      }

      if (createJob) {
        try {
          await deleteRedisHashValue(REDIS_HASH_KEY, jobId, redisClient);
        } catch (error) {
          logger.error({
            requestId,
            msg: `Re-calculate delete job failed`,
            error,
          });
        }
      }
    } else {
      if (jobType === RECALCULATED && !applyNow) {
        res.json({ code: 0, message: 'Success' });
      }

      if (createJob) {
        const updateResult = await updateJobStatus(
          REDIS_HASH_KEY,
          jobId,
          {
            total_count: totalBills,
          },
          redisClient
        );

        if (!updateResult) {
          logger.error(`Update job id ${jobId} total count failed`);

          res.json({
            code: -1,
            job_id: jobId,
            message: 'Update job total count failed',
          });

          return;
        }
      }

      if (
        dataType === SCOOTER_VIN ||
        dataType === SCOOTER_ID ||
        dataType === SCOOTER_PLATE
      ) {
        billingUrl = `${billingEngineUrlArr[0]}/scooter/bill`;
      } else if (
        dataType === GOGORO_USER_ID ||
        dataType === GOGORO_USER_EMAIL
      ) {
        billingUrl = `${billingEngineUrlArr[0]}/user/bill`;
      }

      // dataList = ['pLbxlE4N', '8RAKM2Mm'];
      logger.info({ requestId, msg: 'The data list', data });
      logger.info({ requestId, msg: 'Start to send data to billing-engine' });

      if (jobType === TRANSFER_BILL || (jobType === RECALCULATED && applyNow)) {
        const resultList = await calculateHotBill({
          data,
          billingUrl,
          dataType,
          jobType,
          test,
          billDateInfo,
          serviceAuth,
          applyNow,
          requestId,
          outputType,
        });

        res.json(resultList[0]);
      } else if (
        jobType === RECALCULATED_ERROR ||
        jobType === RECALCULATED_GEN_ERROR
      ) {
        await calculateErrorBill({
          data,
          billingUrl,
          createJob,
          dataType,
          jobId,
          jobType,
          billDateInfo,
          originalJobData: resultJSON,
          redisClient,
          test,
          serviceAuth,
          errorListKey: `${REDIS_ERROR_KEY}_${jobId}`,
          requestId,
          applyNow,
          outputType,
        });
      } else if (jobType === RECALCULATED && !applyNow) {
        await calculatePartialBill({
          data,
          billingUrl,
          createJob,
          dataType,
          jobId,
          jobType,
          billDateInfo,
          originalJobData: resultJSON,
          redisClient,
          test,
          serviceAuth,
          requestId,
          errorListKey: `${REDIS_ERROR_KEY}_${jobId}`,
          applyNow,
          outputType,
        });

        await updateJobStatus(
          REDIS_HASH_KEY,
          jobId,
          {
            status: CALCULATED,
          },
          redisClient
        );
      }
      // errorList = resultList;
    }
  }
};

export default sendDataToBillingEngine;
