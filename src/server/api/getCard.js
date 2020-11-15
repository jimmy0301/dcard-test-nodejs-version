import logger from '../../logger';

const { REDIS_HASH_KEY } = process.env;

const getCard = async (req, res) => {
  const { job_id: jobId } = req.query;
  const { redis: client } = req;

  if (jobId !== undefined) {
    client.hget(REDIS_HASH_KEY, jobId, (err, result) => {
      if (err) {
        logger.error(`Get bill status from redis failed, ${err}`);

        res.json({
          code: -1,
          http_error: `${err}`,
          message: 'Get bill status from redis failed',
        });
      } else {
        logger.info(`${result}`);
        const resultJson = JSON.parse(result);

        if (result !== null) {
          res.json({
            code: 0,
            data: [Object.assign(resultJson, { job_id: jobId })],
          });
        } else {
          res.json({ code: 0, data: [] });
        }
      }
    });
  } else {
    client.hgetall(REDIS_HASH_KEY, (err, obj) => {
      if (err) {
        logger.error(`Get bill status from redis failed, ${err}`);
        res.json({
          code: -1,
          message: `Get bill status from redis failed, ${err}`,
        });

        return;
      }

      logger.info(`The jobList key: ${JSON.stringify(obj)}`);
      if (obj !== null) {
        const keysArray = Object.keys(obj);
        const jobList = [];
        for (let i = 0; i < keysArray.length; i += 1) {
          const value = JSON.parse(obj[keysArray[i]]);
          const jobIdSubStr = keysArray[i].split('_');

          if (jobIdSubStr.length < 3) {
            jobList.push(Object.assign(value, { job_id: keysArray[i] }));
          }
        }
        res.json({ code: 0, data: jobList });
      } else {
        res.json({ code: 0, data: [] });
      }
    });
  }
};

export default getCard;
