import Promise from 'bluebird';
import axios from 'axios';
import { RECALCULATED, TRANSFER_BILL } from '../../api/job-type';
import { SEND_REQUEST_TO_BILLING_ENGINE_FAILED } from '../../api/error-code';
import logger from '../../../logger';
import { generateVirtualAccount } from '../utils/utils';
import { getESContract, updateESContract } from '../data/contract';

const { BILLLING_ENGINE_REQUEST_CONCURRENT } = process.env;
/*
1. If the jobType is transfer or applyNow, the job doesn't save the job status and error list to redis
2. If the jobType is re-calculate error, the job doesn't update success count and failed count directly.
  2.1 After the job finished, the success count and failed count
*/

const calculateHotBill = async ({
  data,
  billingUrl,
  dataType,
  jobType,
  billDateInfo,
  test,
  serviceAuth,
  requestId,
  outputType,
}) => {
  const subRequestIdPrefix = `${requestId}_${jobType}_${dataType}`;
  logger.info({ requestId, msg: `The jobType: ${jobType}` });
  logger.info({ requestId, msg: `The data list length: ${data.length}` });

  const billPromise = Promise.map(
    data,
    async calculateData => {
      const { id } = calculateData;
      let bankVirtualAccount;

      const subRequestId = `${subRequestIdPrefix}_${id}`;
      const result = await getESContract(
        id,
        billDateInfo.cycle_end_day,
        billDateInfo.billing_cycle_start,
        billDateInfo.billing_cycle_end,
        serviceAuth
      );

      if (result.code !== undefined && result.code !== 0) {
        logger.error({
          requestId: subRequestId,
          msg: 'Get es-contract failed',
          data: result,
        });

        return result;
      }

      const [esContractData] = result;
      const { status } = esContractData;
      ({ bank_virtual_account: bankVirtualAccount } = esContractData);

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
            msg: 'Update the bank virtual account failed',
            data: response,
          });

          return response;
        }
      }

      let engineReqData = '';
      if (jobType === TRANSFER_BILL) {
        engineReqData = Object.assign(calculateData, {
          bank_virtual_account: bankVirtualAccount,
          hot_bill: 1,
        });
      } else {
        engineReqData = Object.assign(calculateData, {
          bank_virtual_account: bankVirtualAccount,
        });
      }

      const parameters = {
        billingUrl,
        data_type: dataType,
        ...billDateInfo,
        dispatcher_request_id: subRequestId,
        test,
        output_type: outputType,
        re_calculate: jobType === RECALCULATED ? 1 : 0,
        data: [engineReqData],
      };

      logger.info({
        requestId: subRequestId,
        msg: 'Start to calculate bill',
        parameters: engineReqData,
      });

      try {
        const billResult = await axios.post(billingUrl, parameters);
        const { data: billDataResult } = billResult;

        logger.info({
          requestId: subRequestId,
          msg: 'The billing-engine response',
          data: billDataResult,
        });

        return billResult.data;
      } catch (err) {
        logger.error({
          requestId: subRequestId,
          error: err,
          msg: `CASE 5 id: ${id}, dataType: ${dataType}, jobType: ${jobType} send data to billing-engine failed`,
        });

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

  const responseRes = await Promise.all(billPromise);

  logger.info({
    requestId,
    msg: 'End to send data to billing-engine',
    data: responseRes,
  });

  return responseRes;
};

export default calculateHotBill;
