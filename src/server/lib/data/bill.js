import axios from 'axios';

import {
  WHOLE_DATA,
  NOT_CALCULATE_YET,
  ES_CONTRACT_ID,
  SCOOTER_VIN,
  SCOOTER_PLATE,
  SCOOTER_ID,
} from '../../api/data-type';
import logger from '../../../logger';

const {
  API_SERVER_PROTOCOL,
  API_SERVER_HOST,
  API_SERVER_PORT,
  API_SERVER_VER,
  FIN_REPORT_API_HOST,
  GOAUTH_SVC_CLIENT_ID,
} = process.env;

const dataTypeMapping = {
  [SCOOTER_VIN]: 'vins',
  [SCOOTER_PLATE]: 'plates',
};

const url = `${API_SERVER_PROTOCOL}://${API_SERVER_HOST}:${API_SERVER_PORT}/go-platform/${API_SERVER_VER}`;
const reportUrl = `${FIN_REPORT_API_HOST}`;

const getESBill = async (
  idString,
  billPeriod,
  dataType,
  serviceAuth,
  requestId
) => {
  const api = `${url}/es-bill-scooters/es-bills`;
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(`Get the cipher failed, ${err}`);

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(`The second time get cipher failed, ${error}`);
      cipher = '';

      return {
        code: -1,
        message: `The second time get cipher failed, ${error}`,
      };
    }
  }

  const headers = {
    headers: {
      'GO-Client': GOAUTH_SVC_CLIENT_ID,
      Authorization: `Bearer ${cipher}`,
    },
  };

  let parameters = '';
  if (
    dataType === WHOLE_DATA ||
    dataType === NOT_CALCULATE_YET ||
    dataType === ES_CONTRACT_ID
  ) {
    parameters = {
      op_code: 'get',
      get_data: {
        es_contract_id: idString,
        bill_period: billPeriod,
      },
    };
  } else if (dataType === SCOOTER_VIN || dataType === SCOOTER_PLATE) {
    const scooterAPI = `${url}/scooters`;
    const scooterParameter = {
      op_code: 'get',
      get_data: {
        [dataTypeMapping[dataType]]: [idString],
        pagination_criteria: {
          offset: 0,
          limit: 1,
        },
      },
    };

    try {
      const scooterData = await axios.post(
        scooterAPI,
        scooterParameter,
        headers
      );

      const { data } = scooterData.data;

      if (data && data.length <= 0) {
        logger.error(
          `${dataTypeMapping[dataType]}: ${idString}, There is no scooter data`
        );

        return {
          code: -1,
          message: 'There is no scooter data',
        };
      }

      parameters = {
        op_code: 'get',
        get_data: {
          scooter_id: data[0].scooter_id,
          bill_period: billPeriod,
        },
      };
    } catch (err) {
      logger.error(`Get scooter data failed, ${err}`);

      return {
        code: -1,
        message: 'Get scooter data failed',
      };
    }
  } else if (dataType === SCOOTER_ID) {
    parameters = {
      op_code: 'get',
      get_data: {
        scooter_id: idString,
        bill_period: billPeriod,
      },
    };
  }

  let response = '';

  try {
    response = await axios.post(api, parameters, headers);
  } catch (err) {
    logger.error({
      requestId,
      msg: 'Get es-bill failed',
      error: err,
      parameters,
    });

    return {
      code: -1,
      id: idString,
      data_type: dataType,
      http_error: `${err}`,
      message: 'Get es-bill failed',
    };
  }

  const { data, code } = response.data;

  if (code === -1) {
    logger.error({
      requestId,
      msg: `id: ${idString} get es-bill failed`,
      parameters,
    });

    return {
      code: -1,
      dataPlatform_response: response.data,
      parameter: parameters,
      id: idString,
      message: 'Get es-bill error',
    };
  }

  return data;
};

const updateBillStatus = async (updateData, serviceAuth) => {
  const api = `${url}/es-bills/transitions`;
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(`Get the cipher failed, ${err}`);

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(`The second time get cipher failed, ${error}`);
      cipher = '';

      return {
        code: -1,
        message: `The second time get cipher failed, ${error}`,
      };
    }
  }

  const headers = {
    headers: {
      'GO-Client': GOAUTH_SVC_CLIENT_ID,
      Authorization: `Bearer ${cipher}`,
    },
  };

  const parameters = {
    op_code: 'update',
    update_data: updateData,
  };

  logger.info(`Update bill status parameters: ${JSON.stringify(parameters)}`);

  try {
    const result = await axios.post(api, parameters, headers);
    const { data, code } = result.data;

    return { code, data };
  } catch (err) {
    logger.error(`Update bill status failed, ${err}`);

    return {
      code: -1,
      message: 'Update bill status failed',
    };
  }
};

const generateARReport = async (parameters, serviceAuth, requestId) => {
  const api = `${reportUrl}/es-bills/revenue-estimation`;
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
  } catch (err) {
    logger.error(`Get the cipher failed, ${err}`);

    try {
      cipher = await serviceAuth.getCipher(GOAUTH_SVC_CLIENT_ID);
    } catch (error) {
      logger.error(`The second time get cipher failed, ${error}`);
      cipher = '';

      return {
        code: -1,
        message: `The second time get cipher failed, ${error}`,
      };
    }
  }

  const headers = {
    headers: {
      'GO-Client': GOAUTH_SVC_CLIENT_ID,
      Authorization: `Bearer ${cipher}`,
    },
  };

  let response = '';
  try {
    response = await axios.post(api, parameters, headers);
  } catch (err) {
    logger.error({
      requestId,
      msg: 'Generate AR report failed',
      error: err,
      parameters,
    });

    return {
      code: -1,
      http_error: `${err}`,
      message: 'Generate AR report failed',
    };
  }

  const { data, code } = response.data;

  if (code === -1) {
    logger.error({
      requestId,
      msg: `Generate AR report failed`,
      parameters,
    });

    return {
      code: -1,
      dataPlatform_response: response.data,
      parameter: parameters,
      message: 'Generate AR report failed',
    };
  }

  return data;
};

export { getESBill, updateBillStatus, generateARReport };
