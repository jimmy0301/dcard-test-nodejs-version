import axios from 'axios';
import Decimal from 'decimal.js';
import logger from '../../../logger';
import {
  GET_ES_CONTRACT_FAILED,
  GET_CIPHER_FAILED,
  UPDATE_ES_CONTRACT_FAILED,
  GET_ADDON_FAILED,
  GET_ES_CONTRACT_SCOOTER_FAILED,
  GET_BALANCE_FAILED,
  GET_PROMOTION_FAILED,
  GET_PLAN_HISTORY_FAILED,
  NO_PLAN_TO_CALCULATE,
  NO_ES_CONTRACT,
  API_SUCCESS,
} from '../../api/error-code';

const {
  API_SERVER_PROTOCOL,
  API_SERVER_HOST,
  API_SERVER_PORT,
  API_SERVER_VER,
  GOAUTH_SVC_CLIENT_ID,
} = process.env;

const url = `${API_SERVER_PROTOCOL}://${API_SERVER_HOST}:${API_SERVER_PORT}/go-platform/${API_SERVER_VER}`;

/*
* es_contract_id – ES Contract id
* plan_start – Contract starts date
* plan_end – Contract ends date
* plan_effective_date – Contract effective date
* plan_type – The contract type. The possible values are:
  1: 企業批售 -- Individual user cannot make change to the plan
  2: 一般合約 -- User is allowed to request changes
  3: 促銷合約 -- Promotion contract. individual user cannot request changes.
* bill_to_type – User’s payment responsibility. The possible values are:
  1: Self-pay
  2: Free – It means GEN will pay for the bill
* cycle_payment_day – The payment cycle starts date.
* payment_type – The type of payment methods that user may choose.
  The following are the possible payment methods now:
  PS: 自行繳款
  BA: 約定扣款
  CU: 約定信用卡授權扣款
* payment_freq – The payment frequency. The following are the possible values:
  1: Monthly
  2. Pay per swap
* bill_delivery_method – The method to deliver the bill.
  1. Email
  2. postal mail
* print_odometer_in_bill – Indicate whether to print scooter odometer on the bill.
  0: Do not print scooter odometer information in the bill.
  1: yes, print it.
* invoice_title – The title to print on the invoice (統一發票)
* vat_number – Customer’s VAT number (統一編號)
* payment_terms  -- When payment_freq is 1,
  this value means the number of months the contract plan has.
* print_uniform_invoice – The possible values are:
  0 : It is not necessary to print the uniform invoice (統一發票)
  1 : Print the uniform invoice.
* plan_price – The base plan price if payment_freq is 1.
* unit_base – The possible values are:
  1: KM-based
  2: 10 mAh-based
* unit_threshold -- The maximum number of units the plan price can cover.
  For example, for KM-based plan, this value is set to be 100 if the plan is $299 for 100 KM.
  over_unit_price – For KM-based plan, this means the per KM price
  if the customer riding distance exceeds the unit_threshold.
  exempt_count – The number of times the customer requested exemption in the payment cycle.
  other_charge_count – The number of other charges in the payment cycle.
  addon_count – The number of plan addons for this payment cycle.
  promotion_count – The number of promotions for this payment cycle.
*/

const filterContractToCalculate = (
  contractData,
  cycleEndDay,
  billStart,
  billEnd
) => {
  const {
    cycle_end_day: contractCycleEndDay,
    contract_date: contractDate,
    contract_end: contractEnd,
    // latest_bill_calc_end_date: lastBillCalcEndDate,
  } = contractData;

  if (
    cycleEndDay === contractCycleEndDay &&
    (contractEnd === undefined ||
      (!(billEnd <= contractDate) && !(billStart >= contractEnd)))
  ) {
    return true;
  }

  // if (
  //   contractCycleEndDay !== cycleEndDay &&
  //   lastBillCalcEndDate !== undefined
  // ) {
  //   const momentLastBillCalcEndDate = moment.tz(
  //     lastBillCalcEndDate * 1000,
  //     TIME_ZONE
  //   );

  //   const momentLastMonthBillDate = moment
  //     .tz(billEnd * 1000, TIME_ZONE)
  //     .subtract(1, 'months');

  //   if (momentLastBillCalcEndDate.isSame(momentLastMonthBillDate, 'days')) {
  //     return true;
  //   }

  //   return false;
  // }

  return false;
};

const getESContract = async (
  contractId,
  cycleEndDay,
  billStart,
  billEnd,
  serviceAuth
) => {
  const apiUrl = `${url}/es-contracts`;
  const parameters = {
    op_code: 'get',
    get_data: {
      es_contract_id: contractId,
      time_from: billStart,
      time_to: billEnd,
    },
  };

  let response = '';
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `es-contract id: ${contractId} get es-contract, get the first cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `es-contract id: ${contractId} get es-contract, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        es_contract_id: contractId,
        parameters,
        http_error: `${err}`,
        message: 'Get es-contract, get the second time cipher failed',
      };
    }
  }

  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (e) {
    logger.error(`Get es-contract by contractId: ${contractId}, ${e}`);

    return {
      code: GET_ES_CONTRACT_FAILED,
      es_contract_id: contractId,
      http_error: `${e}`,
      message: 'Get es-contract by es-contract id',
    };
  }

  const { data, code } = response.data;

  if (code === -1) {
    const { additional_code: additionalCode } = response.data;

    logger.error(
      `es-contract id: ${contractId} get es-contract error, additional code: ${additionalCode}, parameter: ${JSON.stringify(
        parameters
      )}`
    );

    return {
      code: GET_ES_CONTRACT_FAILED,
      es_contract_id: contractId,
      dataPlatform_response: response.data,
      parameters,
      message: 'Get es-contract error',
    };
  }

  logger.info(`The es-contract data: ${JSON.stringify(data)}`);

  if (data.length <= 0) {
    return {
      code: NO_ES_CONTRACT,
      message: `es-contract id: ${contractId}, There is no es-contract in this cycle`,
    };
  }

  return data;
};

const searchESContract = async (searchData, serviceAuth) => {
  const apiUrl = `${url}/es-contracts`;
  const parameters = {
    op_code: 'search',
    search_data: searchData,
  };

  let response = '';
  let cipher = '';

  logger.info(`The search request: ${JSON.stringify(parameters)}`);
  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `searchData: ${JSON.stringify(
        searchData
      )} get es-contract, get the first cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `searchData: ${JSON.stringify(
          searchData
        )} get es-contract, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        parameters: searchData,
        message: `Get es-contract, get the second time cipher failed ${err}`,
      };
    }
  }

  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (e) {
    logger.error(
      `Get es-contract by extra search: ${JSON.stringify(searchData)}, ${e}`
    );

    return {
      code: GET_ES_CONTRACT_FAILED,
      parameters,
      http_error: `${e}`,
      message: 'Get es-contract failed',
    };
  }

  const { data, total_count: totalCount, code } = response.data;

  if (code === -1) {
    const { additional_code: additionalCode } = response.data;

    logger.error(
      `Get es-contract error, additional code: ${additionalCode}, parameter: ${JSON.stringify(
        parameters
      )}`
    );

    return {
      code: GET_ES_CONTRACT_FAILED,
      dataplatform_response: response.data,
      parameters,
      message: 'Get es-contract failed',
    };
  }

  if (data.length > 0) {
    return { code: API_SUCCESS, totalCount, data };
  }

  return {
    code: API_SUCCESS,
    totalCount,
    parameters,
    message: 'There is no es-contract',
  };
};

const updateESContract = async (updateData, serviceAuth) => {
  const apiUrl = `${url}/es-contracts`;
  const parameters = {
    op_code: 'update',
    update_data: updateData,
  };

  let response = '';
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `Update data: ${JSON.stringify(
        updateData
      )} update es-contract, get the first cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `Update data: ${JSON.stringify(
          updateData
        )} update es-contract, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        message: `Update data: ${JSON.stringify(
          updateData
        )} update es-contract, get the second time cipher failed ${err}`,
      };
    }
  }

  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (e) {
    logger.error(
      `Update es-contract parameters: ${JSON.stringify(parameters)}, ${e}`
    );

    return {
      code: UPDATE_ES_CONTRACT_FAILED,
      message: `Update es-contract parameters: ${JSON.stringify(
        parameters
      )}, ${e}`,
    };
  }

  const { code } = response.data;

  if (code === -1) {
    const { additional_code: additionalCode } = response.data;

    logger.error(
      `Update es-contract error, additional code: ${additionalCode}, parameter: ${JSON.stringify(
        parameters
      )}`
    );

    return {
      code: UPDATE_ES_CONTRACT_FAILED,
      parameters,
      dataplatform_response: response.data,
      message: 'Update es-contract error',
    };
  }

  return response.data;
};

const getESContractsByUser = async (
  userId,
  userType,
  email,
  mergeBill,
  billStart,
  billEnd,
  billingCycle,
  serviceAuth
) => {
  const apiUrl = `${url}/user-es-contracts`;
  const parameters = {
    op_code: 'get',
    get_data: {
      user_id: userId,
      account_type: userType,
      time_from: billStart,
      time_to: billEnd,
    },
  };

  let cipher = '';
  let response = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `user id: ${userId} get es-contract, get the cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `user id: ${userId} get es-contract, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        message: `user id: ${userId} get es-contract, get the second time cipher failed ${err}`,
      };
    }
  }

  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  const start = process.hrtime();

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (e) {
    logger.error(
      `userId: ${userId} get es-contract error: ${e}, url: ${apiUrl}, parameter: ${JSON.stringify(
        parameters
      )}`
    );
    return {
      code: GET_ES_CONTRACT_FAILED,
      account_id: userId,
      email,
      account_type: userType,
      merge_bill: mergeBill,
      message: `userId: ${userId} get es-contract error, url: ${apiUrl}, parameter: ${JSON.stringify(
        parameters
      )}`,
    };
  }

  const end = process.hrtime(start);

  logger.info(
    `Total execution time for getting es-contract: ${end[0] * 1000 +
      end[1] / 1000000}ms`
  );

  const { data, code } = response.data;
  const contractData = [];

  if (code === -1) {
    const { additional_code: additionalCode } = response.data;

    logger.error(
      `userId: ${userId} get es-contract error, additional code: ${additionalCode}, url: ${apiUrl}, parameter: ${JSON.stringify(
        parameters
      )}`
    );

    return {
      code: GET_ES_CONTRACT_FAILED,
      account_id: userId,
      email,
      account_type: userType,
      merge_bill: mergeBill,
      message: `userId: ${userId} get es-contract error, additional code: ${additionalCode}, url: ${apiUrl}, parameter: ${JSON.stringify(
        parameters
      )}`,
    };
  }

  for (let i = 0; i < data.length; i += 1) {
    const contract = data[i];

    if (
      filterContractToCalculate(
        contract,
        parseInt(billingCycle, 10),
        billStart,
        billEnd
      )
    ) {
      contractData.push(contract);
    }
  }

  response = {
    account_id: userId,
    contracts: contractData,
    email,
    merge_bill: mergeBill,
    account_type: userType,
  };

  return response;
};

const getContractBalance = async (contractId, serviceAuth) => {
  const apiUrl = `${url}/es-contracts/balances`;
  const parameters = {
    op_code: 'get',
    get_data: {
      es_contract_id_list: [contractId],
    },
  };

  const start = process.hrtime();
  let cipher = '';
  let response = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `es-contract id: ${contractId} get es-contract balance, get the cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `es-contract id: ${contractId} get es-contract balance, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        message: `es-contract id: ${contractId} get es-contract balance, get the second time cipher failed ${err}`,
      };
    }
  }

  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (err) {
    logger.error(
      `Get contract balances error: ${err}, parameter: ${JSON.stringify(
        parameters
      )}`
    );

    return {
      code: GET_BALANCE_FAILED,
      parameters,
      http_error: `${err}`,
      message: 'Get contract balances error',
    };
  }

  const end = process.hrtime(start);

  logger.info(
    `Total execution time for getting balances: ${end[0] * 1000 +
      end[1] / 1000000}ms`
  );

  const { data, code } = response.data;

  if (data === undefined || code === -1) {
    const { additional_code: additionalCode } = response.data;

    logger.error(
      `The es-contract ${contractId} get balances error, additional code: ${additionalCode}, parameters: ${JSON.stringify(
        parameters
      )}`
    );

    return {
      code: GET_BALANCE_FAILED,
      message: `The es-contract ${contractId} get balances error, additional code: ${additionalCode}, parameters: ${JSON.stringify(
        parameters
      )}`,
    };
  }

  return data;
};

const getContractPlanHistories = async (
  contractId,
  billStart,
  billEnd,
  serviceAuth
) => {
  const apiUrl = `${url}/es-contracts/plan-histories`;
  const parameters = {
    op_code: 'get',
    get_data: {
      es_contract_id: contractId,
      time_from: billStart,
      time_to: billEnd,
    },
  };

  let response = '';
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `es-contract id: ${contractId} get es-contract plan histories, get the cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `es-contract id: ${contractId} get es-contract plan histories, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        api_url: apiUrl,
        es_contract_id: contractId,
        http_error: `${err}`,
        message: 'Get the second time cipher failed',
      };
    }
  }

  console.log(cipher);
  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  const start = process.hrtime();

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (err) {
    const end = process.hrtime(start);

    const executionTime = `${new Decimal(end[0])
      .mul(1000)
      .plus(new Decimal(end[1]).dividedBy(1000000))
      .toString()}ms`;

    const errorData = {
      code: GET_PLAN_HISTORY_FAILED,
      api_url: apiUrl,
      es_contract_id: contractId,
      parameters,
      http_error: `${err}`,
      execution_time: executionTime,
      message: 'Get the plan histories failed',
    };

    logger.error(`${JSON.stringify(errorData)}`);

    return errorData;
  }

  const end = process.hrtime(start);

  const executionTime = `${new Decimal(end[0])
    .mul(1000)
    .plus(new Decimal(end[1]).dividedBy(1000000))
    .toString()}ms`;

  logger.info(
    `Total execution time for getting plan histories: ${executionTime}`
  );

  const { data, code } = response.data;

  if (data === undefined || code === -1) {
    const errorData = {
      code: GET_PLAN_HISTORY_FAILED,
      api_url: apiUrl,
      dataPlatform_response: response.data,
      es_contract_id: contractId,
      parameters,
      execution_time: executionTime,
      message: 'Get the plan histories failed',
    };

    logger.error(`${JSON.stringify(errorData)}`);

    return errorData;
  }

  const result = [];
  for (let i = 0; i < data.length; i += 1) {
    const { plan_effective_date: planEffectiveDate } = data[i];

    if (planEffectiveDate && planEffectiveDate <= billEnd) {
      result.push(data[i]);
    } else {
      logger.error(
        `es-contract id: ${contractId} has invalid plan history data: ${JSON.stringify(
          data[i]
        )}`
      );
    }
  }

  if (result.length <= 0) {
    return {
      code: NO_PLAN_TO_CALCULATE,
      api_url: apiUrl,
      dataPlatform_response: response.data,
      es_contract_id: contractId,
      parameters,
      execution_time: executionTime,
      message: 'There is no plan',
    };
  }

  return result;
};

const getContractAddons = async (
  contractId,
  billStart,
  billEnd,
  serviceAuth
) => {
  const apiUrl = `${url}/es-contracts/addons`;
  const parameters = {
    op_code: 'get',
    get_data: {
      es_contract_id: contractId,
      time_from: billStart,
      time_to: billEnd,
      search_type: 1,
      pagination_criteria: {
        limit: 2000,
      },
    },
  };

  const start = process.hrtime();

  let response = '';
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `es-contract id: ${contractId} get es-contract addon, get the cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `es-contract id: ${contractId} get es-contract addon, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        api_url: apiUrl,
        es_contract_id: contractId,
        http_error: `${err}`,
        parameters,
        message: 'Get the second time cipher failed',
      };
    }
  }

  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (err) {
    const end = process.hrtime(start);
    const executionTime = `${new Decimal(end[0])
      .mul(1000)
      .plus(new Decimal(end[1]).dividedBy(1000000))
      .toString()}ms`;

    const errorData = {
      code: GET_ADDON_FAILED,
      api_url: apiUrl,
      es_contract_id: contractId,
      http_error: `${err}`,
      parameters,
      execution_time: executionTime,
      message: 'Get add-on failed',
    };

    logger.error(`${JSON.stringify(errorData)}`);

    return errorData;
  }

  const end = process.hrtime(start);
  const executionTime = `${new Decimal(end[0])
    .mul(1000)
    .plus(new Decimal(end[1]).dividedBy(1000000))
    .toString()}ms`;

  logger.info(
    `Total execution time for getting escontract addons: ${executionTime}`
  );

  const addonList = [];
  const { data, code } = response.data;

  if (code === -1) {
    const errorData = {
      code: GET_ADDON_FAILED,
      dataPlatform_response: response.data,
      api_url: apiUrl,
      es_contract_id: contractId,
      parameters,
      execution_time: executionTime,
      message: 'Get add-on failed',
    };

    logger.error(`${JSON.stringify(errorData)}`);

    return errorData;
  }

  logger.info(`The addon list: ${JSON.stringify(data)}`);

  for (let i = 0; i < data.length; i += 1) {
    const addon = data[i];
    const { end_date: endDate, effective_date: effectiveDate } = addon;
    let usageFrom = effectiveDate;
    let usageTo = endDate;
    let newAddonData = {};

    if (effectiveDate && effectiveDate <= billEnd) {
      if (effectiveDate < billStart) {
        usageFrom = billStart;
      }

      if (endDate > billEnd || endDate === undefined) {
        usageTo = billEnd;
      }

      newAddonData = Object.assign(addon, {
        usage_from: usageFrom,
        usage_to: usageTo,
      });

      addonList.push(newAddonData);
    }
  }

  return addonList;
};

const getContractPromotions = async (
  contractId,
  billStart,
  billEnd,
  serviceAuth
) => {
  const apiUrl = `${url}/es-contracts/promotions`;
  const parameters = {
    op_code: 'get',
    get_data: {
      es_contract_id: contractId,
      time_from: billStart,
      time_to: billEnd,
    },
  };

  let response = '';
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `es-contract id: ${contractId} get es-contract promotions, get the cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `es-contract id: ${contractId} get es-contract promotions, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        message: `es-contract id: ${contractId} get es-contract promotions, get the second time cipher failed ${err}`,
      };
    }
  }

  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  const start = process.hrtime();

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (err) {
    logger.error(
      `es-contract id: ${contractId}, get contract promotion failed: ${err}`
    );

    return {
      code: GET_PROMOTION_FAILED,
      message: `es-contract id: ${contractId}, get contract promotion failed: ${err}`,
    };
  }

  const end = process.hrtime(start);

  logger.info(
    `Total execution time for getting escontract promotions: ${end[0] * 1000 +
      end[1] / 1000000}ms`
  );

  const { code } = response.data;

  if (code === -1) {
    const { additional_code: additionalCode } = response.data;

    logger.error(`The es-contract ${contractId} get promotion error,
    additional code: ${additionalCode}, parameters: ${JSON.stringify(
      parameters
    )}`);

    return response.data;
  }

  logger.info(`
    The response of the promotion: ${JSON.stringify(response.data.data)}`);

  return response.data.data;
};

const getContractScooters = async (
  contractId,
  scooterIds,
  billStart,
  billEnd,
  serviceAuth
) => {
  const apiUrl = `${url}/es-contracts/scooters`;
  const parameters = {
    op_code: 'get',
    get_data: {
      es_contract_id: contractId,
      time_from: billStart,
      time_to: billEnd,
    },
  };

  let response = '';
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(
      `es-contract id: ${contractId} get es-contract scooters, get the cipher failed ${err}`
    );

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(
        `es-contract id: ${contractId} get es-contract scooters, get the second time cipher failed ${err}`
      );

      return {
        code: GET_CIPHER_FAILED,
        api_url: apiUrl,
        es_contract_id: contractId,
        http_error: `${error}`,
        message: 'Get the second time cipher failed',
      };
    }
  }

  const headers = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  const start = process.hrtime();

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (err) {
    logger.error(`Get contract ${contractId} scooter failed: ${err}`);

    return {
      code: GET_ES_CONTRACT_SCOOTER_FAILED,
      api_url: apiUrl,
      es_contract_id: contractId,
      parameters,
      http_error: `${err}`,
      message: `Get contract scooter failed`,
    };
  }

  const end = process.hrtime(start);

  logger.info(
    `Total execution time for getting escontract scooters: ${end[0] * 1000 +
      end[1] / 1000000}ms`
  );

  const { data, code } = response.data;

  if (code === -1) {
    const { additional_code: additionalCode } = response.data;

    logger.error(
      `The es-contract ${contractId} get es-contract scooters error, additional code: ${additionalCode}`
    );

    return {
      code: GET_ES_CONTRACT_SCOOTER_FAILED,
      api_url: apiUrl,
      dataPlatform_response: response.data,
      es_contract_id: contractId,
      parameters,
      message: `Get contract scooter failed`,
    };
  }

  let scooterIdList = [];

  if (scooterIds !== null) {
    for (let i = 0; i < data.length; i += 1) {
      const scooterObj = data[i];
      for (let j = 0; j < scooterIds.length; j += 1) {
        if (scooterObj.scooter_id === scooterIds[j]) {
          scooterIdList.push(scooterObj);
        }
      }
    }
  } else {
    scooterIdList = data;
  }

  if (scooterIdList.length <= 0) {
    return {
      code: GET_ES_CONTRACT_SCOOTER_FAILED,
      api_url: apiUrl,
      es_contract_id: contractId,
      parameters,
      message: 'There is no scooter to generate bill',
    };
  }

  return scooterIdList;
};

const getContractOtherCharge = async (
  contractId,
  billStart,
  billEnd,
  headers
) => {
  const apiUrl = `${url}/es-contracts/other-charges`;
  const parameters = {
    op_code: 'get',
    get_data: {
      es_contract_id: contractId,
      charged_flag: 1,
      time_from: billStart,
      time_to: billEnd,
    },
  };

  let response = '';

  // console.log('The headers:', headers);

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (err) {
    logger.error(`Get contract other charge failed: ${err.response.data}`);

    return [];
  }

  return response.data.data;
};

const getContractExempt = async (contractId, billStart, billEnd, headers) => {
  const apiUrl = `${url}/es-contracts/exempts`;
  const parameters = {
    op_code: 'get',
    get_data: {
      es_contract_id: contractId,
      time_from: billStart,
      time_to: billEnd,
    },
  };

  let response = '';

  try {
    response = await axios.post(apiUrl, parameters, { headers });
  } catch (err) {
    logger.error(`Get contract exempt failed: ${err}`);

    return [];
  }

  const exemptDataList = [];

  const { data } = response.data;

  for (let i = 0; i < data.length; i += 1) {
    const exemptData = data[i];
    const { exempt_from: exemptFrom, exempt_to: exemptTo } = exemptData;
    const newExemptData = {};

    if (exemptFrom < billStart) {
      newExemptData.exempt_from = billStart;
      newExemptData.exempt_to = exemptTo;
    } else if (exemptTo > billEnd) {
      newExemptData.exempt_from = exemptFrom;
      newExemptData.exempt_to = billEnd;
    } else {
      newExemptData.exempt_from = exemptFrom;
      newExemptData.exempt_to = exemptTo;
    }

    exemptDataList.push(newExemptData);
  }

  return exemptDataList;
};

export {
  getESContractsByUser,
  getContractBalance,
  getContractPlanHistories,
  getContractExempt,
  getContractOtherCharge,
  getContractAddons,
  getContractPromotions,
  getContractScooters,
  updateESContract,
  searchESContract,
  getESContract,
};
