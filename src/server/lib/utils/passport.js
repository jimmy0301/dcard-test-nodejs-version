import passport from 'passport';
import Strategy from 'passport-http-bearer';
import logger from '../../../logger';

passport.use(
  new Strategy(async (accessToken, done) => {
    try {
      const authRes = { content: '123', email: '456' };
      const { content } = authRes;
      const { email } = content;
      done(null, email, accessToken);
    } catch (error) {
      logger.error(error);
      done(null, false, 'Unauthorized');
    }
  })
);
