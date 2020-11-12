import fs from 'fs';
import logger from '../../../logger';

const getRedisHashValue = (hashKey, field, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.hget(hashKey, field, (err, result) => {
      if (err) {
        logger.error(`Get hash key: ${hashKey}, field: ${field}, ${err}`);

        return reject(err);
      }

      return resolve(result);
    });
  });
};

const setRedisHashValue = (hashKey, field, value, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.hset(hashKey, field, value, (err, result) => {
      if (err) {
        logger.error(
          `Set hash key: ${hashKey}, field: ${field}, value: ${value}, ${err}`
        );

        return reject(err);
      }

      return resolve(result);
    });
  });
};

const getRedisAllHashValue = (hashKey, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.hgetall(hashKey, (err, result) => {
      if (err) {
        logger.error(`Get hash key: ${hashKey}, ${err}`);

        return reject(err);
      }

      return resolve(result);
    });
  });
};

const deleteRedisHashValue = (hashKey, field, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.hdel(hashKey, field, (err, result) => {
      if (err) {
        logger.error(`Delete hash key: ${hashKey}, field: ${field}, ${err}`);

        return reject(err);
      }

      return resolve(result);
    });
  });
};

const listPush = (listName, value, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.LPUSH(listName, value, (err, result) => {
      if (err) {
        logger.error(
          `Push list data: ${value}, list name: ${listName}, ${err}`
        );

        return reject(err);
      }

      logger.info(`Push list data: ${listName}, value: ${value}, success`);
      return resolve(result);
    });
  });
};

const getListLen = (listName, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.LLEN(listName, (err, result) => {
      if (err) {
        logger.error(`Get list length: ${listName}, ${err}`);

        return reject(err);
      }

      return resolve(result);
    });
  });
};

const getList = (listName, start, end, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.LRANGE(listName, start, end, (err, result) => {
      if (err) {
        logger.error(`Get list: ${listName}, ${err}`);

        return reject(err);
      }

      return resolve(result);
    });
  });
};

const deleteList = (listName, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.del(listName, (err, result) => {
      if (err) {
        logger.error(`Delete list: ${listName}, ${err}`);
        return reject(err);
      }

      return resolve(result);
    });
  });
};

const deleteElementFromList = (listName, element, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.lrem(listName, 0, element, (err, result) => {
      if (err) {
        logger.error(
          `Delete element from list, list name: ${listName}, element: ${element}, ${err}`
        );
        return reject(err);
      }

      return resolve(result);
    });
  });
};

const updateJobStatus = async (hashKey, jobId, updateData, redisClient) => {
  const redisResult = await getRedisHashValue(hashKey, jobId, redisClient);
  let redisResultJson = '';
  if (redisResult) {
    redisResultJson = JSON.parse(redisResult);

    redisResultJson = Object.assign(redisResultJson, updateData);
  } else {
    redisResultJson = updateData;
  }

  const setResult = await setRedisHashValue(
    hashKey,
    jobId,
    JSON.stringify(redisResultJson),
    redisClient
  );

  if (!setResult) {
    return {
      code: 0,
      message: `update job: ${jobId}, data: ${JSON.stringify(
        updateData
      )} success`,
    };
  }

  return {
    code: -1,
    message: `update job: ${jobId}, data: ${JSON.stringify(updateData)} failed`,
  };
};

const updateErrorList = async (hashKey, jobId, updateData, redisClient) => {
  try {
    const redisResult = await getRedisHashValue(hashKey, jobId, redisClient);
    logger.info(`The redis result: ${redisResult}`);

    if (redisResult) {
      const redisResultJson = JSON.parse(redisResult);

      logger.info(
        `The json parse redis result: ${JSON.stringify(redisResultJson)}`
      );

      await setRedisHashValue(
        hashKey,
        jobId,
        JSON.stringify(redisResultJson),
        redisClient
      );
    } else {
      await setRedisHashValue(
        hashKey,
        jobId,
        JSON.stringify(updateData),
        redisClient
      );
    }

    return {
      code: 0,
      message: `update job: ${jobId}, data: ${JSON.stringify(
        updateData
      )} success`,
    };
  } catch (err) {
    return {
      code: -1,
      message: `Set the redis failed, data: ${JSON.stringify(
        updateData
      )}, error: ${err}`,
    };
  }
};

const setKey = (keyName, value, expiredTime, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.set(keyName, value, 'EX', expiredTime, (err, result) => {
      if (err) {
        logger.error(`Set Key: ${keyName} failed, ${err}`);
        return reject(err);
      }

      return resolve(result);
    });
  });
};

const getKey = (keyName, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.set(keyName, (err, result) => {
      if (err) {
        logger.error(`Get Key: ${keyName} failed, ${err}`);
        return reject(err);
      }

      return resolve(result);
    });
  });
};

const increaseKey = (keyName, redisClient) => {
  return new Promise((resolve, reject) => {
    redisClient.incr(keyName, (err, result) => {
      if (err) {
        logger.error(`Get Key: ${keyName} failed, ${err}`);
        return reject(err);
      }

      return resolve(result);
    });
  });
};

const evalScript = (
  scriptFileName,
  keyName,
  numberOfKey,
  argv1,
  argv2,
  argv3,
  redisClient
) => {
  return new Promise((resolve, reject) => {
    redisClient.eval(
      fs.readFileSync(scriptFileName),
      numberOfKey,
      keyName,
      argv1,
      argv2,
      argv3,
      (err, result) => {
        if (err) {
          logger.error(`Eval script: ${keyName} failed, ${err}`);
          return reject(err);
        }

        return resolve(result);
      }
    );
  });
};

export {
  getRedisHashValue,
  setRedisHashValue,
  getRedisAllHashValue,
  deleteRedisHashValue,
  updateJobStatus,
  updateErrorList,
  listPush,
  getListLen,
  getList,
  setKey,
  getKey,
  evalScript,
  increaseKey,
  deleteElementFromList,
  deleteList,
};
