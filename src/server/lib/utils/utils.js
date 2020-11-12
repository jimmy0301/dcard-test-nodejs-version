import randomstring from 'randomstring';
import logger from '../../../logger';
import {
  API_SUCCESS,
  // DUPLICATE_BILL,
} from '../../api/error-code';
import { RECALCULATED, RECALCULATED_GEN_ERROR } from '../../api/job-type';

const { VIRTUAL_ACCOUNT_LENGTH = 10 } = process.env;
const DRAFT = 1;

const chunk = (array, size) => {
  const chunkArr = [];
  let index = 0;

  while (index < array.length) {
    chunkArr.push(array.slice(index, size + index));
    index += size;
  }

  return chunkArr;
};

const validTimeRange = (timeStart1, timeStart2, timeTo1, timeTo2) => {
  if (timeStart1 >= timeTo1) {
    return false;
  }

  if (timeStart2 >= timeTo2) {
    return false;
  }

  if (timeStart1 <= timeStart2 && timeTo1 >= timeTo2) {
    return true;
  }

  return false;
};

const genBillingEngineUrl = (protocolArr, hostArr, portArr) => {
  const result = [];

  for (let i = 0; i < protocolArr.length; i += 1) {
    if (portArr[i]) {
      result.push(`${protocolArr[i]}://${hostArr[i]}:${portArr[i]}`);
    } else {
      result.push(`${protocolArr[i]}://${hostArr[i]}`);
    }
  }

  return result;
};

const checkBillError = ({
  billDataResult,
  parameters,
  jobType,
  id,
  requestId,
}) => {
  let failedCount = 0;
  let successCount = 0;
  const errorListData = [];
  const pendingApprovalIdList = [];
  let errorData = {};

  if (billDataResult.code === API_SUCCESS) {
    const { result: resultData } = billDataResult;

    for (let i = 0; i < resultData.length; i += 1) {
      // const { dataPlatform_response: dataPlatformRes } = resultData[i];
      if (resultData[i].code !== API_SUCCESS) {
        logger.error({ requestId, msg: 'CASE 1 failed', data: billDataResult });

        failedCount += 1;

        errorData = Object.assign(resultData[i], parameters, {
          id,
          job_type: jobType,
        });

        delete errorData.data;

        errorListData.push(errorData);
      } else {
        logger.info({ requestId, msg: 'Create bill successfully' });

        successCount += 1;

        if (
          (jobType === RECALCULATED || jobType === RECALCULATED_GEN_ERROR) &&
          resultData[i].bill_status === DRAFT
        ) {
          pendingApprovalIdList.push(id);
        }
      }
    }
  } else {
    logger.error({ requestId, msg: 'CASE 2 failed', data: billDataResult });

    failedCount += 1;

    errorData = Object.assign(billDataResult, parameters, {
      id,
      job_type: jobType,
    });

    delete errorData.data;

    errorListData.push(errorData);
  }

  return {
    errorList: errorListData,
    pendingApprovalIdList,
    failedCount,
    successCount,
  };
};

const generateVirtualAccount = () => {
  let bankAccount = `${randomstring.generate({
    length: 1,
    charset: 'numeric',
  })}`;

  for (let i = 0; i < parseInt(VIRTUAL_ACCOUNT_LENGTH, 10) - 1; i += 1) {
    bankAccount = bankAccount.concat(
      `${randomstring.generate({ length: 1, charset: 'numeric' })}`
    );
  }

  return bankAccount;
};

export {
  chunk,
  validTimeRange,
  genBillingEngineUrl,
  checkBillError,
  generateVirtualAccount,
};
