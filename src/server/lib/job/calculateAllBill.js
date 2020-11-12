import Promise from 'bluebird';
import moment from 'moment-timezone';
import axios from 'axios';
import { searchESContract, updateESContract } from '../data/contract';
import {
  updateJobStatus,
  listPush,
  getList,
  deleteList,
  getListLen,
} from '../redis';
import {
  SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
  UPDATE_ES_CONTRACT_FAILED,
  API_SUCCESS,
} from '../../api/error-code';
import logger from '../../../logger';
import { checkBillError, generateVirtualAccount } from '../utils/utils';
import { generateARReport } from '../data/bill';

const {
  REDIS_HASH_KEY,
  BILLLING_ENGINE_REQUEST_CONCURRENT,
  VIRTUAL_ACCOUNT_LENGTH = 10,
  TIME_ZONE,
} = process.env;

const storeDataListToRedis = async ({
  requestId,
  startOffIndex,
  billDateInfo,
  maxCount,
  statusList,
  dataListKey,
  serviceAuth,
  redisClient,
}) => {
  const billDataListPromise = Promise.map(
    startOffIndex,
    async offset => {
      const parameters = {
        cycle_end_day: billDateInfo.cycle_end_day,
        contract_time_from: billDateInfo.billing_cycle_start,
        contract_time_to: billDateInfo.billing_cycle_end,
        latest_bill_calc_end_date_to: billDateInfo.billing_cycle_end - 1,
        status_list: statusList,
        sort_flag: [1],
        pagination_criteria: {
          offset,
          limit: maxCount,
        },
      };

      logger.info({
        requestId,
        msg: `The offset index: ${offset}, The parameters`,
        parameters,
      });

      const esContractDataList = await searchESContract(
        parameters,
        serviceAuth
      );

      if (
        esContractDataList.code !== undefined &&
        esContractDataList.code !== API_SUCCESS
      ) {
        logger.error({ requestId, msg: 'Get es-contract error', parameters });

        return esContractDataList;
      }

      logger.info({
        requestId,
        msg: `The es-contract data list length: ${esContractDataList.data.length}`,
      });

      const storeRedisResultPromise = Promise.map(
        esContractDataList.data,
        async esContractData => {
          const newData = {
            bank_virtual_account: esContractData.bank_virtual_account,
            es_contract_id: esContractData.es_contract_id,
            status: esContractData.status,
          };

          await listPush(dataListKey, JSON.stringify(newData), redisClient);
        },
        { concurrency: parseInt(BILLLING_ENGINE_REQUEST_CONCURRENT, 10) }
      );

      const result = await Promise.all(storeRedisResultPromise);

      return result;
    },
    { concurrency: 1 }
  );

  await Promise.all(billDataListPromise);

  const billListLen = await getListLen(dataListKey, redisClient);

  logger.info({
    requestId,
    msg: `The number of es-contracts calculate bill: ${billListLen}`,
  });

  return billListLen;
};

const calculateAllBill = async ({
  startOffIndex,
  billingUrl,
  dataType,
  jobId,
  jobType,
  billDateInfo,
  maxCount,
  statusList,
  redisClient,
  requestId,
  errorListKey,
  dataListKey,
  outputType,
  serviceAuth,
}) => {
  let failedCount = 0;
  let successCount = 0;

  const listLen = await getListLen(dataListKey, redisClient);
  if (listLen > 0) {
    const deleteListRes = await deleteList(dataListKey, redisClient);
    if (!deleteListRes) {
      logger.error({
        requestId,
        msg: `Before store data to redis, delete list result: ${deleteListRes}`,
      });

      return;
    }
  }
  const billListLen = await storeDataListToRedis({
    requestId,
    startOffIndex,
    billDateInfo,
    maxCount,
    statusList,
    serviceAuth,
    dataListKey,
    redisClient,
  });

  const updateResult = await updateJobStatus(
    REDIS_HASH_KEY,
    jobId,
    {
      total_count: billListLen,
    },
    redisClient
  );

  if (!updateResult) {
    logger.error({
      requestId,
      msg: `Update job id ${jobId} total count failed in calculating all bill`,
    });

    return;
  }

  const subRequestIdPrefix = `${requestId}_${jobId}_${dataType}`;
  const billResultPromise = Promise.map(
    startOffIndex,
    async offset => {
      // const parameters = {
      //   cycle_end_day: billDateInfo.cycle_end_day,
      //   contract_time_from: billDateInfo.billing_cycle_start,
      //   contract_time_to: billDateInfo.billing_cycle_end,
      //   // latest_bill_calc_end_date_to: billDateInfo.billing_cycle_end - 1,
      //   status_list: statusList,
      //   sort_flag: [1],
      //   pagination_criteria: {
      //     offset,
      //     limit: maxCount,
      //   },
      // };

      logger.info({
        requestId,
        msg: `The offset index: ${offset}`,
      });

      const esContractDataList = await getList(
        dataListKey,
        offset,
        offset + maxCount - 1,
        redisClient
      );

      if (!esContractDataList) {
        logger.error({
          requestId,
          msg: `Get es-contract data from redis failed, start: ${offset}, end: ${offset +
            maxCount -
            1}`,
        });
      }
      logger.info({
        requestId,
        msg: 'The es-contract data',
        data: esContractDataList,
      });
      // if (
      //   esContractDataList.code !== undefined &&
      //   esContractDataList.code !== API_SUCCESS
      // ) {
      //   logger.error({ requestId, msg: 'Get es-contract error', parameters });

      //   return esContractDataList;
      // }

      // const filterESContract = esContractDataList.data.filter(
      //   esContract =>
      //     esContract.latest_bill_calc_end_date === undefined ||
      //     esContract.latest_bill_calc_end_date < billDateInfo.billing_cycle_end
      // );

      // logger.info({
      //   requestId,
      //   msg: `The es-contract data list length: ${filterESContract.length}`,
      // });

      const sendEngineResultPromise = Promise.map(
        esContractDataList,
        async esContractData => {
          const esContract = JSON.parse(esContractData);
          const { es_contract_id: esContractId, status } = esContract;
          let { bank_virtual_account: bankVirtualAccount } = esContract;
          const subRequestId = `${subRequestIdPrefix}_${esContractId}`;

          logger.info({
            requestId: subRequestId,
            msg: `Start to calculate es-contract id:${esContractId}`,
          });

          logger.info({
            requestId: subRequestId,
            msg: `es-contract id: ${esContractId}, At first Failed count: ${failedCount}, success count: ${successCount}`,
          });

          if (
            bankVirtualAccount === undefined ||
            bankVirtualAccount.length < parseInt(VIRTUAL_ACCOUNT_LENGTH, 10)
          ) {
            const virtualAccount = generateVirtualAccount();
            bankVirtualAccount = virtualAccount;

            logger.info({
              requestId: subRequestId,
              msg: `es-contract id: ${esContractId}, after generate bankVirtualAccount: ${virtualAccount}`,
            });

            const response = await updateESContract(
              {
                es_contract_id: esContractId,
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
                msg: `CASE 3 es-contract id: ${esContractId} Update the bank virtual account failed`,
                data: response,
              });

              failedCount += 1;
              await updateJobStatus(
                REDIS_HASH_KEY,
                jobId,
                {
                  failed_count: failedCount,
                },
                redisClient
              );

              const errorData = {
                code: UPDATE_ES_CONTRACT_FAILED,
                job_type: jobType,
                data_type: dataType,
                id: esContractId,
                billingUrl,
                ...billDateInfo,
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

          logger.info({
            requestId: subRequestId,
            msg: `The es-contract id: ${esContractId}, bankVirtualAccount: ${bankVirtualAccount}`,
          });

          const engineReq = {
            billingUrl,
            dispatcher_request_id: subRequestId,
            data_type: dataType,
            ...billDateInfo,
            output_type: outputType,
            data: [
              { id: esContractId, bank_virtual_account: bankVirtualAccount },
            ],
          };

          logger.info({
            requestId: subRequestId,
            msg: `es-contract id: ${esContractId} send parameter to billing-engine`,
            parameters: engineReq,
          });

          try {
            const billResult = await axios.post(billingUrl, engineReq);
            const { data: billDataResult } = billResult;

            const checkErrorResult = checkBillError({
              billDataResult,
              parameters: engineReq,
              jobType,
              id: esContractId,
              requestId: subRequestId,
            });

            successCount += checkErrorResult.successCount;
            failedCount += checkErrorResult.failedCount;

            logger.info({
              requestId: subRequestId,
              msg: `es-contract id: ${esContractId}, after send to billing-engine, the failed count: ${failedCount}, success count: ${successCount}`,
            });

            await updateJobStatus(
              REDIS_HASH_KEY,
              jobId,
              {
                success_count: successCount,
                pending_approved_count: successCount,
                failed_count: failedCount,
              },
              redisClient
            );

            if (checkErrorResult.errorList.length > 0) {
              logger.error({
                requestId: subRequestId,
                msg: `The es-contract id: ${esContractId} Add bill failed`,
              });

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
              msg: `CASE 4 The error es-contract id: ${esContractId} send data to billing-engine failed`,
              error: err,
            });

            failedCount += 1;

            const errorData = Object.assign(
              {
                code: SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
                job_type: jobType,
                data_type: dataType,
                id: esContractId,
                http_error: `${err}`,
                message: 'send data to billing-engine failed',
              },
              engineReq
            );

            delete errorData.data;

            await listPush(
              errorListKey,
              JSON.stringify(errorData),
              redisClient
            );

            // errorList.push(errorData);

            await updateJobStatus(
              REDIS_HASH_KEY,
              jobId,
              {
                failed_count: failedCount,
              },
              redisClient
            );

            return {
              code: SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
              data_type: dataType,
              job_type: jobType,
              id: esContractId,
              http_error: `${err}`,
              message: 'Send data to billing-engine failed',
            };
          }
        },
        { concurrency: parseInt(BILLLING_ENGINE_REQUEST_CONCURRENT, 10) }
      );

      const result = await Promise.all(sendEngineResultPromise);

      return result;
    },
    { concurrency: 1 }
  );

  await Promise.all(billResultPromise);

  logger.info({
    requestId,
    msg: `After calculate all bill, The success count: ${successCount}`,
  });

  logger.info({
    requestId,
    msg: `After calculate all bill, The failed count: ${failedCount}`,
  });

  const parameters = {
    op_code: 'get',
    get_data: {
      bill_period: moment
        .tz(billDateInfo.default_issue_time * 1000, TIME_ZONE)
        .format('YYYY-MM'),
    },
  };
  const reportRes = await generateARReport(parameters, serviceAuth, requestId);

  if (reportRes.code !== undefined && reportRes.code !== 0) {
    logger.info({
      requestId,
      msg: 'Generate AR resport failed',
    });
  }
};

export default calculateAllBill;
