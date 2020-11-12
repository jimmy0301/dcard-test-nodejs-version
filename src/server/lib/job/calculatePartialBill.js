import Promise from 'bluebird';
import axios from 'axios';
import {
  SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
  API_SUCCESS,
  GET_ES_CONTRACT_FAILED,
} from '../../api/error-code';
import logger from '../../../logger';
import { ES_CONTRACT_ID } from '../../api/data-type';
import { checkBillError } from '../utils/utils';
import { listPush, updateJobStatus } from '../redis';
import { getESContract } from '../data/contract';

const { REDIS_HASH_KEY, BILLLING_ENGINE_REQUEST_CONCURRENT } = process.env;
/*
1. If the jobType is transfer or applyNow, the job doesn't save the job status and error list to redis
2. If the jobType is re-calculate error, the job doesn't update success count and failed count directly.
  2.1 After the job finished, the success count and failed count
*/
const CANCELLATION = 5;

const calculatePartialBill = async ({
  data,
  billingUrl,
  dataType,
  jobId,
  jobType,
  billDateInfo,
  redisClient,
  errorListKey,
  requestId,
  outputType,
  serviceAuth,
}) => {
  let failedCount = 0;
  let successCount = 0;
  let pendingApprovalIdList = [];
  const subRequestIdPrefix = `${requestId}_${jobId}_${dataType}`;

  logger.info({ requestId, msg: `The jobType: ${jobType}` });
  logger.info({ requestId, msg: `The data list length: ${data.length}` });
  const billPromise = Promise.map(
    data,
    async calculateData => {
      const { id } = calculateData;
      const subRequestId = `${subRequestIdPrefix}_${id}`;

      let result = '';
      if (dataType === ES_CONTRACT_ID) {
        result = await getESContract(
          id,
          billDateInfo.cycle_end_day,
          billDateInfo.billing_cycle_start,
          billDateInfo.billing_cycle_end,
          serviceAuth
        );

        if (result.code !== undefined && result.code !== 0) {
          logger.error({
            requestId: subRequestId,
            msg: 'CASE 5 Get es-contract failed',
            data: result,
          });

          failedCount += 1;

          const errorData = {
            code: GET_ES_CONTRACT_FAILED,
            job_type: jobType,
            data_type: dataType,
            id,
            billingUrl,
            ...billDateInfo,
            re_calculate: 1,
            message: 'Update virtual account failed',
          };

          delete errorData.data;

          await listPush(errorListKey, JSON.stringify(errorData), redisClient);

          return result;
        }

        const [esContractData] = result;
        const { status } = esContractData;
        if (status === CANCELLATION) {
          logger.info({
            requestId: subRequestId,
            msg: 'The es-contract is cancellation',
            data: { es_contract_id: id },
          });

          failedCount += 1;

          const errorData = {
            code: GET_ES_CONTRACT_FAILED,
            job_type: jobType,
            data_type: dataType,
            id,
            billingUrl,
            ...billDateInfo,
            re_calculate: 1,
            message: 'The es-contract is cancellation',
          };

          delete errorData.data;

          await listPush(errorListKey, JSON.stringify(errorData), redisClient);

          return {
            code: API_SUCCESS,
            es_contract_id: id,
            message: 'The es-contract is cancellation',
          };
        }
      }

      const parameters = {
        billingUrl,
        data_type: dataType,
        dispatcher_request_id: subRequestId,
        ...billDateInfo,
        test: 0,
        output_type: outputType,
        re_calculate: 1,
        data: [calculateData],
      };

      logger.info({
        requestId: subRequestId,
        msg: 'The calculate parameters',
        parameters,
      });

      try {
        const billResult = await axios.post(billingUrl, parameters);
        const { data: billDataResult } = billResult;

        logger.info({
          requestId: subRequestId,
          msg: 'The billing-engine response',
          data: billDataResult,
        });

        // The jobType is Re-calculate, Re-caculate error from create new process, and Re-calculate error from Re-calculate job
        const checkErrorResult = checkBillError({
          billDataResult,
          parameters,
          jobType,
          requestId: subRequestId,
          id,
        });

        if (checkErrorResult.pendingApprovalIdList.length > 0) {
          pendingApprovalIdList = pendingApprovalIdList.concat(
            checkErrorResult.pendingApprovalIdList
          );
        }

        successCount += checkErrorResult.successCount;
        failedCount += checkErrorResult.failedCount;

        logger.info({
          requestId: subRequestId,
          msg: `Data id:${id}, after send to billing-engine, the failed count: ${failedCount}, success count: ${successCount}`,
        });

        await updateJobStatus(
          REDIS_HASH_KEY,
          jobId,
          {
            success_count: successCount,
            failed_count: failedCount,
          },
          redisClient
        );

        if (checkErrorResult.errorList.length > 0) {
          const pushErrorListPromise = Promise.map(
            checkErrorResult.errorList,
            async errorData => {
              const pushRes = await listPush(
                errorListKey,
                JSON.stringify(errorData),
                redisClient
              );

              return pushRes;
            },
            {
              concurrency: parseInt(BILLLING_ENGINE_REQUEST_CONCURRENT, 10),
            }
          );

          const pushErrorListRes = await Promise.all(pushErrorListPromise);

          logger.info({
            requestId: subRequestId,
            msg: 'The push error list result',
            data: pushErrorListRes,
          });
        }

        return billResult.data;
      } catch (err) {
        logger.error({
          requestId: subRequestId,
          msg: `CASE 5 id: ${id}, dataType: ${dataType}, jobType: ${jobType} send data to billing-engine failed`,
          error: err,
        });

        const errorData = Object.assign(
          {
            code: SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
            job_type: jobType,
            data_type: dataType,
            id,
            http_error: `${err}`,
            message: 'Send data to billing-engine failed',
          },
          parameters
        );

        delete errorData.data;

        failedCount += 1;

        await updateJobStatus(
          REDIS_HASH_KEY,
          jobId,
          {
            failed_count: failedCount,
          },
          redisClient
        );

        await listPush(errorListKey, JSON.stringify(errorData), redisClient);

        return {
          code: SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
          data_type: dataType,
          job_type: jobType,
          id,
          http_error: `${err}`,
          message: 'Send data to billing-engine failed',
        };
      }
    },
    { concurrency: parseInt(BILLLING_ENGINE_REQUEST_CONCURRENT, 10) }
  );

  await Promise.all(billPromise);

  logger.info({
    requestId,
    msg: `After re-calculating bill, The success count: ${successCount}`,
  });

  logger.info({
    requestId,
    msg: `After re-calculating bill, The failed count: ${failedCount}`,
  });

  const updateResult = await updateJobStatus(
    REDIS_HASH_KEY,
    jobId,
    {
      approved_count: data.length - pendingApprovalIdList.length - failedCount,
      pending_approved_count: pendingApprovalIdList.length,
      pending_approved_id_list: pendingApprovalIdList,
    },
    redisClient
  );

  if (!updateResult) {
    logger.error({
      requestId,
      msg: `Update job id ${jobId} pending approval id failed`,
    });
  }
};

export default calculatePartialBill;
