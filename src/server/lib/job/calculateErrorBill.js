import Promise from 'bluebird';
import axios from 'axios';
import moment from 'moment-timezone';
import {
  RECALCULATED,
  RECALCULATED_GEN_ERROR,
  TRANSFER_BILL,
  jobTypeMapping,
  RECALCULATED_ERROR,
} from '../../api/job-type';
import {
  SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
  UPDATE_ES_CONTRACT_FAILED,
  GET_ES_CONTRACT_FAILED,
  API_SUCCESS,
} from '../../api/error-code';
import { ES_CONTRACT_ID } from '../../api/data-type';
import logger from '../../../logger';
import {
  updateJobStatus,
  deleteList,
  listPush,
  getListLen,
  deleteRedisHashValue,
} from '../redis';
import { checkBillError, generateVirtualAccount } from '../utils/utils';
import { getESBill } from '../data/bill';
import { getESContract, updateESContract } from '../data/contract';

const {
  REDIS_HASH_KEY,
  REDIS_ERROR_KEY,
  REDIS_DATA_KEY = 'contractDataList',
  BILLLING_ENGINE_REQUEST_CONCURRENT,
  TIME_ZONE,
} = process.env;
/*
1. If the jobType is transfer or applyNow, the job doesn't save the job status and error list to redis
2. If the jobType is re-calculate error, the job doesn't update success count and failed count directly.
  2.1 After the job finished, the success count and failed count
*/

const CANCELLATION = 5;
const DRAFT = 1;

const calculateErrorBill = async ({
  data,
  billingUrl,
  dataType,
  jobId,
  jobType,
  billDateInfo,
  originalJobData,
  redisClient,
  test,
  serviceAuth,
  errorListKey,
  applyNow,
  requestId,
  outputType,
}) => {
  let failedCount = 0;
  let successCount = 0;
  let waiveErrorCount = 0;
  const finalPendingApproveId =
    originalJobData.pending_approved_id_list === undefined ||
    jobType !== RECALCULATED_GEN_ERROR
      ? []
      : originalJobData.pending_approved_id_list;

  const subRequestIdPrefix = `${requestId}_${jobId}_${dataType}`;

  logger.info({ requestId, msg: `The jobType: ${jobType}` });
  logger.info({ requestId, msg: `The data list length: ${data.length}` });
  await deleteList(errorListKey, redisClient);
  const billPromise = Promise.map(
    data,
    async calculateData => {
      const { id } = calculateData;
      let bankVirtualAccount;
      const subRequestId = `${subRequestIdPrefix}_${id}`;

      let billPeriod = moment
        .tz(billDateInfo.default_issue_time * 1000, TIME_ZONE)
        .format('YYYY-MM');
      let esBill = await getESBill(
        id,
        billPeriod,
        dataType,
        serviceAuth,
        subRequestId
      );

      if (
        esBill.code === undefined &&
        esBill.length > 0 &&
        esBill[0].date_from === billDateInfo.billing_cycle_start
      ) {
        successCount += 1;
        if (
          esBill[0].bill_status === DRAFT &&
          jobType === RECALCULATED_GEN_ERROR
        ) {
          if (finalPendingApproveId.indexOf(id) === -1) {
            finalPendingApproveId.push(id);
          }
        }

        logger.info({
          requestId,
          msg: `The es-bill has already in data platform`,
        });

        return {
          code: API_SUCCESS,
          message: 'The es-bill has already in data platform',
        };
      }

      let result = '';
      let engineReqData = calculateData;
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
            re_calculate: jobType === RECALCULATED ? 1 : 0,
            message: 'Update virtual account failed',
          };

          delete errorData.data;

          await listPush(errorListKey, JSON.stringify(errorData), redisClient);

          return result;
        }

        const [esContractData] = result;
        const { status } = esContractData;
        if (status === CANCELLATION) {
          waiveErrorCount += 1;

          logger.info({
            requestId: subRequestId,
            msg: 'The es-contract is cancellation',
            data: { es_contract_id: id },
          });

          return {
            code: API_SUCCESS,
            es_contract_id: id,
            message: 'The es-contract is cancellation',
          };
        }

        if (bankVirtualAccount === undefined) {
          const virtualAccount = generateVirtualAccount();
          bankVirtualAccount = virtualAccount;
          const response = await updateESContract(
            {
              es_contract_id: id,
              plan_end: 0,
              bank_virtual_account: virtualAccount,
              default_plan_id: '0',
              status,
            },
            serviceAuth
          );

          if (response.code !== 0) {
            logger.error({
              requestId: subRequestId,
              msg: 'CASE 3 Update the bank virtual account failed',
              data: response,
            });

            failedCount += 1;
            // If the jobType is Re-calculate, the counter update dynamically
            const errorData = {
              code: UPDATE_ES_CONTRACT_FAILED,
              job_type: jobType,
              data_type: dataType,
              id,
              billingUrl,
              ...billDateInfo,
              re_calculate:
                jobType === RECALCULATED || jobType === RECALCULATED_GEN_ERROR
                  ? 1
                  : 0,
              message: 'Update virtual account failed',
            };

            delete errorData.data;

            await listPush(
              errorListKey,
              JSON.stringify(errorData),
              redisClient
            );

            return response;
          }
        }

        engineReqData = Object.assign(calculateData, {
          bank_virtual_account: bankVirtualAccount,
        });
      }

      const parameters = {
        billingUrl,
        data_type: dataType,
        ...billDateInfo,
        dispatcher_request_id: subRequestId,
        test: jobType !== TRANSFER_BILL && !applyNow ? undefined : test,
        output_type: outputType,
        re_calculate: jobType === RECALCULATED_GEN_ERROR ? 1 : 0,
        data: [engineReqData],
      };

      logger.info({
        requestId: subRequestId,
        msg: 'The calculating parameters',
        parameters,
      });

      try {
        const billResult = await axios.post(billingUrl, parameters);
        const { data: billDataResult } = billResult;

        // The jobType is Re-calculate, Re-caculate error from create new process, and Re-calculate error from Re-calculate job
        const checkErrorResult = checkBillError({
          billDataResult,
          parameters,
          jobType,
          id,
          requestId: subRequestId,
        });

        if (checkErrorResult.pendingApprovalIdList.length > 0) {
          // pendingApprovalIdList = pendingApprovalIdList.concat(
          //   checkErrorResult.pendingApprovalIdList
          // );
          const { pendingApprovalIdList } = checkErrorResult;
          for (let i = 0; i < pendingApprovalIdList.length; i += 1) {
            if (
              finalPendingApproveId.indexOf(pendingApprovalIdList[i]) === -1
            ) {
              finalPendingApproveId.push(pendingApprovalIdList[i]);
            }
          }
        }

        successCount += checkErrorResult.successCount;
        failedCount += checkErrorResult.failedCount;

        logger.info({
          requestId: subRequestId,
          msg: `The data id: ${id}, data type: ${dataType}, After send to billing-engine failed count: ${failedCount}, success count: ${successCount}`,
        });

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

        let hasESBill = false;
        billPeriod = moment
          .tz(billDateInfo.default_issue_time * 1000, TIME_ZONE)
          .format('YYYY-MM');
        esBill = await getESBill(
          id,
          billPeriod,
          dataType,
          serviceAuth,
          subRequestId
        );

        if (esBill.code === undefined && esBill.length > 0) {
          hasESBill = true;
        }

        // If this period bill didn't exist, response error.
        if (!hasESBill) {
          logger.error({
            request: subRequestId,
            msg: `CASE 5 id: ${id}, dataType: ${dataType}, jobType: ${jobType} send data to billing-engine failed`,
            error: err,
          });
          failedCount += 1;

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
        // errorList.push(errorData);

        logger.info({
          requestId: subRequestId,
          msg: `es-contract id: ${id}, The es-bill has already in data platform`,
        });

        successCount += 1;

        if (finalPendingApproveId.indexOf(id) === -1) {
          finalPendingApproveId.push(id);
        }

        return {
          code: API_SUCCESS,
          message: 'The es-bill has already in data platform',
        };
      }
    },
    { concurrency: parseInt(BILLLING_ENGINE_REQUEST_CONCURRENT, 10) }
  );

  await Promise.all(billPromise);

  logger.info({
    requestId,
    msg: `The original success count: ${originalJobData.success_count}`,
  });
  logger.info({
    requestId,
    msg: `The original failed count: ${originalJobData.failed_count}`,
  });
  logger.info({
    requestId,
    msg: `${jobTypeMapping[jobType]}, The success count: ${successCount}`,
  });

  const listLen = await getListLen(errorListKey, redisClient);

  logger.info({
    requestId,
    msg: `${jobTypeMapping[jobType]}, The failed count: ${listLen}`,
  });

  const newTotalCount = originalJobData.total_count - waiveErrorCount;
  const newSuccessCount = originalJobData.success_count + successCount;
  let approvedCount = 0;
  let pendingApprovedCount = 0;

  if (jobType === RECALCULATED_GEN_ERROR) {
    approvedCount = newTotalCount - listLen - finalPendingApproveId.length;
    pendingApprovedCount = finalPendingApproveId.length;
  } else if (jobType === RECALCULATED_ERROR) {
    pendingApprovedCount =
      originalJobData.pending_approved_count + successCount;
    approvedCount = newTotalCount - listLen - pendingApprovedCount;
  }

  const updateRes = await updateJobStatus(
    REDIS_HASH_KEY,
    jobId,
    {
      success_count: newSuccessCount,
      failed_count: listLen <= 0 ? 0 : listLen,
      approved_count: approvedCount,
      pending_approved_count: pendingApprovedCount,
      pending_approved_id_list: finalPendingApproveId,
      total_count: newTotalCount,
    },
    redisClient
  );

  if (updateRes.code === -1) {
    logger.error({
      requestId,
      msg: `${jobTypeMapping[jobType]} update job status, jobId: ${jobId}`,
    });
  }

  if (newSuccessCount === 0 && listLen <= 0) {
    const deleteRes = await deleteRedisHashValue(
      REDIS_HASH_KEY,
      jobId,
      redisClient
    );

    if (deleteRes) {
      logger.info({ requestId, msg: `Delete Job: ${jobId} success` });

      const deleteErrorListRes = await deleteList(
        `${REDIS_ERROR_KEY}_${jobId}`,
        redisClient
      );

      if (deleteErrorListRes) {
        logger.info({
          requestId,
          msg: `Delete error list success, jobId: ${jobId}`,
        });
      }

      const deleteDataListRes = await deleteList(
        `${REDIS_DATA_KEY}_${jobId}`,
        redisClient
      );

      if (deleteDataListRes) {
        logger.info({
          requestId,
          msg: `Delete data list success, jobId: ${jobId}`,
        });
      }
    }
  }

  // delete job which prevent re-calculte error concurrent in the same time
  await deleteRedisHashValue(
    REDIS_HASH_KEY,
    `${jobId}_${jobType}`,
    redisClient
  );
};

export default calculateErrorBill;
