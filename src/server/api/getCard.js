import logger from '../../logger';
import {
  getRedisHashValue,
  setRedisHashValue,
  getRedisAllHashValue,
  deleteRedisHashValue,
  deleteList,
} from '../lib/redis';
import { RECALCULATED, CALCULATE_ALL_DATA } from './job-type';
import { WHOLE_DATA } from './data-type';

const { REDIS_HASH_KEY, REDIS_ERROR_KEY, REDIS_DATA_KEY } = process.env;

const IDLE = 1;
const IN_PROGRESS = 2;
const CALCULATED = 3;
const APPROVED = 4;
const ISSUING = 5;

const getJob = async (req, res) => {
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

const updateJob = async (req, res) => {
  const {
    job_id: jobId,
    status,
    approved_count: approvedCount,
    success_count: successCount,
    pending_approved_count: pendingApprovedCount,
    pending_approved_id_list: pendingApprovalIdList,
  } = req.body;
  const { redis: client, id: requestId } = req;

  logger.info(`Update Job, the parameters: ${JSON.stringify(req.body)}`);

  if (
    status !== undefined &&
    status !== null &&
    status !== IDLE &&
    status !== IN_PROGRESS &&
    status !== CALCULATED &&
    status !== APPROVED &&
    status !== ISSUING
  ) {
    res.json({ code: -1, message: `Invalid status: ${status}` });

    return;
  }

  if (
    approvedCount !== undefined &&
    approvedCount !== null &&
    parseInt(approvedCount, 10) < 0
  ) {
    res.json({ code: -1, message: `Invalid approved count: ${approvedCount}` });

    return;
  }

  if (
    successCount !== undefined &&
    successCount !== null &&
    parseInt(successCount, 10) < 0
  ) {
    res.json({ code: -1, message: `Invalid success count: ${successCount}` });

    return;
  }

  if (
    pendingApprovedCount !== undefined &&
    pendingApprovedCount !== null &&
    parseInt(pendingApprovedCount, 10) < 0
  ) {
    res.json({
      code: -1,
      message: `Invalid pending approved count: ${pendingApprovedCount}`,
    });

    return;
  }

  if (
    pendingApprovalIdList !== undefined &&
    pendingApprovalIdList !== null &&
    !Array.isArray(pendingApprovalIdList)
  ) {
    res.json({
      code: -1,
      message: `Invalid pending approved id list: ${pendingApprovalIdList}`,
    });

    return;
  }

  if (jobId) {
    const [, jobType] = jobId.split('_');
    try {
      const jobData = await getRedisHashValue(REDIS_HASH_KEY, jobId, client);
      const jobDataJson = JSON.parse(jobData);

      if (status !== undefined && status !== null) {
        jobDataJson.status = status;
      }

      if (approvedCount !== undefined && approvedCount !== null) {
        jobDataJson.approved_count = approvedCount;
      }

      if (successCount !== undefined && successCount !== null) {
        jobDataJson.success_count = successCount;
      }

      if (pendingApprovedCount !== undefined && pendingApprovedCount !== null) {
        jobDataJson.pending_approved_count = pendingApprovedCount;
      }

      if (
        pendingApprovalIdList !== undefined &&
        pendingApprovalIdList !== null
      ) {
        jobDataJson.pending_approved_id_list = pendingApprovalIdList;
      }

      if (
        jobDataJson.approved_count +
          jobDataJson.pending_approved_count +
          jobDataJson.failed_count !==
        jobDataJson.total_count
      ) {
        res.json({
          code: -1,
          message:
            'The setting number is wrong: approved_count + pending_approved_count + failed_count !== total_count',
        });

        return;
      }

      try {
        const setResult = await setRedisHashValue(
          REDIS_HASH_KEY,
          jobId,
          JSON.stringify(jobDataJson),
          client
        );

        if (setResult) {
          logger.error(`Set redis job status failed, for job id ${jobId}`);

          res.json({
            code: -1,
            message: `Set redis job status failed, for job id ${jobId}`,
          });
        } else {
          logger.error(
            `After update Job, the success count: ${jobDataJson.success_count}, the failed count: ${jobDataJson.failed_count}`
          );
          if (jobDataJson.approved_count === jobDataJson.total_count) {
            const deleteRes = await deleteRedisHashValue(
              REDIS_HASH_KEY,
              jobId,
              client
            );

            if (deleteRes) {
              logger.info({ requestId, msg: `Delete Job: ${jobId} success` });

              if (
                jobType === CALCULATE_ALL_DATA ||
                jobDataJson.data_type === WHOLE_DATA
              ) {
                const deleteDataListRes = await deleteList(
                  `${REDIS_DATA_KEY}_${jobId}`,
                  client
                );

                if (deleteDataListRes) {
                  res.json({
                    code: 0,
                    job_id: jobId,
                    message: `Delete data list successfully`,
                  });

                  return;
                }

                res.json({
                  code: -1,
                  error_list_key: `${jobId}`,
                  message: 'Delete data list failed',
                });

                return;
              }

              res.json({
                code: 0,
                job_id: jobId,
                message: `Delete job successfully`,
              });

              return;
            }
          }

          res.json({
            code: 0,
            message: `job id ${jobId} set redis job status success`,
          });
        }
      } catch (error) {
        logger.error(
          `Set redis job status failed, ${error}, for job id ${jobId}`
        );

        res.json({
          code: -1,
          message: `Set redis job status failed, ${error}, for job id ${jobId}`,
        });
      }
    } catch (err) {
      logger.error(`jobId: ${jobId} Get hash value failed, ${err}`);

      res.json({
        code: -1,
        message: `jobId: ${jobId} Get hash value failed, ${err}`,
      });
    }
  } else {
    try {
      const jobData = await getRedisAllHashValue(REDIS_HASH_KEY, client);
      const jobDataJson = JSON.parse(jobData);

      const keysArray = Object.keys(jobDataJson);
      const value = jobDataJson[keysArray[0]];
      const valueJson = JSON.parse(value);

      if (status !== undefined && status !== null) {
        valueJson.status = status;
      }

      if (approvedCount !== undefined && approvedCount !== null) {
        valueJson.approved_count = approvedCount;
      }

      if (successCount !== undefined && successCount !== null) {
        valueJson.success_count = successCount;
      }

      if (pendingApprovedCount !== undefined && pendingApprovedCount !== null) {
        valueJson.pending_approved_count = pendingApprovedCount;
      }

      if (
        pendingApprovalIdList !== undefined &&
        pendingApprovalIdList !== null
      ) {
        valueJson.pending_approved_id_list = pendingApprovalIdList;
      }

      try {
        const setResult = await setRedisHashValue(
          REDIS_HASH_KEY,
          keysArray[0],
          JSON.stringify(valueJson),
          client
        );

        // set result === 0 is success
        if (setResult) {
          logger.error(
            `Set redis job status failed, for job id ${keysArray[0]}`
          );

          res.json({
            code: -1,
            message: `Set redis job status failed, for job id ${keysArray[0]}`,
          });
        } else {
          const [, jobType] = keysArray[0].split('_');
          if (valueJson.success_count === 0 && valueJson.failed_count === 0) {
            const deleteRes = await deleteRedisHashValue(
              REDIS_HASH_KEY,
              keysArray[0],
              client
            );

            if (deleteRes) {
              logger.info({
                requestId,
                msg: `Delete Job: ${keysArray[0]} success`,
              });

              if (
                jobType === CALCULATE_ALL_DATA ||
                valueJson.data_type === WHOLE_DATA
              ) {
                const deleteDataListRes = await deleteList(
                  `${REDIS_DATA_KEY}_${keysArray[0]}`,
                  client
                );

                if (deleteDataListRes) {
                  res.json({
                    code: 0,
                    job_id: keysArray[0],
                    message: `Delete data list successfully`,
                  });

                  return;
                }

                res.json({
                  code: -1,
                  error_list_key: `${keysArray[0]}`,
                  message: 'Delete data list failed',
                });

                return;
              }

              res.json({
                code: 0,
                job_id: keysArray[0],
                message: `Delete job successfully`,
              });

              return;
            }
          }

          res.json({
            code: 0,
            message: `job id ${keysArray[0]} set redis job status success`,
          });
        }
      } catch (error) {
        logger.error(
          `Set redis job status failed, ${error}, for job id ${keysArray[0]}`
        );

        res.json({
          code: -1,
          message: `Set redis job status failed, ${error}, for job id ${
            keysArray[0]
          }`,
        });
      }
    } catch (err) {
      logger.error(`Get Redis All Hash Value failed, ${err}`);

      res.json({
        code: -1,
        message: `Get Redis All Hash Value failed, ${err}`,
      });
    }
  }
};

const deleteJob = async (req, res) => {
  const { job_id: jobId } = req.body;
  const { redis: client, id: requestId } = req;

  if (jobId !== undefined) {
    const [, jobType] = jobId.split('_');
    try {
      const deleteRes = await deleteRedisHashValue(
        REDIS_HASH_KEY,
        jobId,
        client
      );

      if (deleteRes) {
        logger.info({ requestId, msg: `Delete Job: ${jobId} success` });

        const deleteErrorListRes = await deleteList(
          `${REDIS_ERROR_KEY}_${jobId}`,
          client
        );

        if (deleteErrorListRes) {
          logger.info({
            requestId,
            msg: `Delete error list success, jobId: ${jobId}`,
          });

          if (parseInt(jobType, 10) === RECALCULATED) {
            logger.info({
              requestId,
              msg: `jobId: ${jobId} Delete error list successfully`,
            });

            res.json({
              code: 0,
              error_list_key: `${jobId}`,
              message: 'Delete error list successfully',
            });

            return;
          }
        }

        if (parseInt(jobType, 10) === RECALCULATED) {
          res.json({
            code: 0,
            job_id: jobId,
            message: `Delete error list successfully`,
          });

          return;
        }

        const deleteDataListRes = await deleteList(
          `${REDIS_DATA_KEY}_${jobId}`,
          client
        );

        if (deleteDataListRes) {
          res.json({
            code: 0,
            job_id: jobId,
            message: `Delete data and error list successfully`,
          });

          return;
        }

        res.json({
          code: -1,
          error_list_key: `${jobId}`,
          message: 'Delete error or data list failed',
        });
      } else {
        logger.error({ requestId, msg: `Delete Job: ${jobId} failed` });

        res.json({ code: -1, message: `Delete Job: ${jobId} failed` });
      }
    } catch (err) {
      logger.error({
        requestId,
        msg: `Delete Job: ${jobId} failed`,
        error: err,
      });

      res.json({ code: -1, message: `Delete Job: ${jobId} failed, ${err}` });
    }
  } else {
    try {
      const jobData = await getRedisAllHashValue(REDIS_HASH_KEY, client);
      const keysArray = Object.keys(jobData);

      try {
        const deleteRes = await deleteRedisHashValue(
          REDIS_HASH_KEY,
          keysArray[0],
          client
        );

        if (deleteRes) {
          logger.info({
            requestId,
            msg: `Delete Job: ${keysArray[0]} success`,
          });

          const listName = `${REDIS_ERROR_KEY}_${keysArray[0]}`;
          const deleteErrorListRes = await deleteList(
            `${REDIS_ERROR_KEY}_${keysArray[0]}`,
            client
          );

          if (deleteErrorListRes) {
            logger.error({
              requestId,
              msg: `Delete error list successfully, jobId: ${keysArray[0]}`,
            });
          }

          const deleteDataListRes = await deleteList(
            `${REDIS_DATA_KEY}_${keysArray[0]}`,
            client
          );

          if (deleteDataListRes) {
            res.json({
              code: 0,
              message: `Delete data and error list ${jobId} success`,
            });

            return;
          }

          res.json({
            code: -1,
            error_list_key: `${listName}`,
            message: 'Delete error list failed',
          });
        } else {
          logger.error({
            requestId,
            msg: `Delete Job: ${keysArray[0]} failed`,
          });

          res.json({ code: -1, message: `Delete Job: ${keysArray[0]} failed` });
        }
      } catch (err) {
        logger.error({
          requestId,
          msg: `Delete Job: ${keysArray[0]} failed`,
          error: err,
        });

        res.json({ code: -1, message: `Delete Job: ${jobId} failed, ${err}` });
      }
    } catch (err) {
      logger.error({ requestId, msg: `Delete job failed`, error: err });

      res.json({ code: -1, message: `Delete Job failed, ${err}` });
    }
  }
};

export { getJob, updateJob, deleteJob };
