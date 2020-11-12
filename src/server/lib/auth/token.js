import GetAuth from './auth';
import logger from '../../../logger';

const GetToken = async (user, password) => {
  let grant = '';
  let token = '';
  const keycloak = GetAuth({});

  logger.info(`Get the token from memory: ${token}`);

  if (token === '') {
    if (keycloak) {
      try {
        grant = await keycloak.grantManager.obtainDirectly(user, password);
      } catch (err) {
        logger.error(`Get the grant failed: ${err}`);
      }

      token = JSON.parse(grant).access_token;
    }
  } else {
    const verifyToken = await keycloak.grantManager.validateAccessToken(token);

    token = verifyToken;
  }

  // myCache.del('token');
  // await myCache.set('token', token);

  logger.info(`The token before return: ${token}`);

  return token;
};

const VerifyToken = (req, res, next) => {
  next();
};

export { GetToken, VerifyToken };
