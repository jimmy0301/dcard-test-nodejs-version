import axios from 'axios';
import getKeycloakToken from '../auth/auth';
import {
  GET_CIPHER_FAILED,
  SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
} from '../../api/error-code';
import logger from '../../../logger';

const {
  BILLING_ENGINE_PROTOCOL,
  BILLING_ENGINE_HOST,
  BILLING_ENGINE_PORT,
  GOAUTH_SVC_CLIENT_ID,
} = process.env;

const generateESContractBill = async (parameters, serviceAuth) => {
  const apiUrl = `${BILLING_ENGINE_PROTOCOL}://${BILLING_ENGINE_HOST}:${BILLING_ENGINE_PORT}/es-contract/bill`;
  let cipher = '';

  cipher = await getKeycloakToken(serviceAuth);

  if (cipher === '') {
    return {
      code: GET_CIPHER_FAILED,
      message: `[generateESContractBill] parameters: ${JSON.stringify(
        parameters
      )}, get cipher failed`,
    };
  }

  const genHeaders = {
    'Go-Client': GOAUTH_SVC_CLIENT_ID,
    Authorization: `Bearer ${cipher}`,
  };

  try {
    const response = await axios.post(apiUrl, parameters, { genHeaders });
    const { code } = response.data;

    if (code === 0) {
      logger.info(
        `parameters: ${JSON.stringify(parameters)}, generate bill success`
      );
    } else {
      logger.error(
        `parameters: ${JSON.stringify(parameters)}, generate bill failed`
      );
    }

    return response.data;
  } catch (err) {
    logger.error(`Send generate bill to billing-engine failed, ${err}`);

    return {
      code: SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
      message: `parameters: ${JSON.stringify(
        parameters
      )} send data to billing-engine failed`,
    };
  }
};

export default generateESContractBill;
