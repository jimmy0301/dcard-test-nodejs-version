import logger from '../../../logger';

const getKeycloakToken = async serviceAuth => {
  let cipher = '';

  try {
    cipher = await serviceAuth.getCipher();
  } catch (err) {
    logger.error(`Get cipher failed, ${err}`);
  }

  return cipher;
};

export default getKeycloakToken;
