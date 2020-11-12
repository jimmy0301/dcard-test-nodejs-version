import moment from 'moment-timezone';
import logger from '../../logger';
import { evalScript } from '../lib/redis';

const {
  REQUEST_LIMIT,
  REDIS_KEY_EXPIRED_TIME,
  HANDLE_REQUEST_LUA_FILE_NAME,
} = process.env;

const checkRequestLimit = async (req, res, next) => {
  // 1. Get remote IP
  const clientIP = req.get('x-forwarded-for') || req.connection.remoteAddress;
  const { redis: redisClient, id: requestId, originalUrl, method } = req;
  const requestLimit = parseInt(REQUEST_LIMIT, 10);
  /* 2. Get request times from redis by IP
    2.1 If the IP exists in the redis, get the request times
      2.1.1 If the request times is larger than 1000, the request times adds 1 in redis and response 405
      2.1.2 If the request times is not larger than 1000, update request times adds 1 in redis
    2.2 If the IP doesn't exist in the redis, check the db record whether it exists.
      2.2.1 If the IP exists in the db, check the IP whether it is expired.
        2.2.1.1 If the ip expired in the redis, set the update time, create time and request times to 1
        2.2.1.1 If the ip doesn't exist in the db, insert the ip data to the db table and redis
  */

  try {
    const requestTimes = await evalScript(
      HANDLE_REQUEST_LUA_FILE_NAME,
      `${originalUrl.substring(1, originalUrl.length)}:${method}:${clientIP}`,
      1,
      moment().unix(),
      requestLimit,
      parseInt(REDIS_KEY_EXPIRED_TIME, 10),
      redisClient
    );

    if (requestTimes[0] === -1) {
      res.set({
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': requestTimes[1],
      });
      res.status(429).send('Too Many Requests');
    } else {
      res.set({
        'X-RateLimit-Remaining': requestTimes[0],
        'X-RateLimit-Reset': requestTimes[1],
      });
      next();
    }
  } catch (error) {
    logger.error({
      requestId,
      message: 'Get the requestTimes from Redis failed',
      error,
    });

    res
      .status(500)
      .send({ code: -1, message: 'Get the requestTimes from Redis failed' });
  }
};

export default checkRequestLimit;
