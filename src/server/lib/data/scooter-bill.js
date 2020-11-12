// import axios from 'axios';
// import moment from 'moment-timezone';
// import getKeycloakToken from '../auth/auth';
// import {
//   GET_CIPHER_FAILED,
//   SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
// } from '../../api/error-code';
// import logger from '../../../logger';
// import { setRedisHashValue } from '../redis/redis_hash';

// const {
//   BILLING_ENGINE_PROTOCOL,
//   BILLING_ENGINE_HOST,
//   BILLING_ENGINE_PORT,
//   GOAUTH_SVC_CLIENT_ID,
//   BILLLING_ENGINE_REQUEST_CONCURRENT,
//   REDIS_HASH_KEY,
//   TIME_ZONE,
// } = process.env;

// const RECALCULATE = 1;
// const RECALCULATE_ERROR = 2;
// const PROCESS = 2;
// const CALCULATED = 3;

const generateScooterBill = async (req, res, serviceAuth) => {
  // const apiUrl = `${BILLING_ENGINE_PROTOCOL}://${BILLING_ENGINE_HOST}:${BILLING_ENGINE_PORT}/scooter/bill`;
  console.log(serviceAuth);
  res.json({ code: 0, message: 'yes' });
  // const {
  //   data,
  //   job_type: jobType,
  //   data_type: dataType,
  //   billing_cycle_start: billingCycleStart,
  //   billing_cycle_end: billingCycleEnd,
  //   payment_due_date: dueDate,
  //   bill_issue_date: billDate, // 出帳日
  //   default_issue_time: defaultIssueTime,
  // } = req.body;

  // const { redis: redisClient } = req;

  // if (jobType === RECALCULATE) {
  //   const jobData = {
  //     data_type: dataType,
  //     status: PROCESS,
  //     success_count: 0,
  //     failed_count: 0,
  //     total_count: 0,
  //     billing_cycle_start: billingCycleStart, // billing cycle 起始日
  //     billing_cycle_end: billingCycleEnd, // billing cycle 截止日
  //     payment_due_date: dueDate, // 繳費截止日
  //     bill_issue_date: billDate, // 出帳日
  //     default_issue_time: defaultIssueTime,
  //   };

  //   let redisSetResult = '';
  //   const jobIdPrefix = moment
  //     .tz(defaultIssueTime * 1000, TIME_ZONE)
  //     .format('YYYY-MM-DD');
  //   const jobId = `${jobIdPrefix}_${jobType}`;

  //   try {
  //     redisSetResult = await setRedisHashValue(
  //       REDIS_HASH_KEY,
  //       jobId,
  //       JSON.stringify(jobData),
  //       redisClient
  //     );

  //     res.json({ code: 0, message: 'success' });

  //     console.log(redisSetResult);
  //   } catch (err) {
  //     logger.error(`Calculate all bills and set redis failed, ${err}`);

  //     res.json({
  //       code: -1,
  //       message: `Calculate all bills and set redis failed, ${err}`,
  //     });

  //     return;
  //   }
  // }
  // let failedCount = 0;
  // let successCount = 0;
  // const errorList = [];
  // const scooterBillPromise = Promise.map(
  //   data,
  //   async id => {
  //     const idList = [id];
  //     const newParameters = Object(req.body, { data: idList });
  //     let cipher = '';
  //     cipher = await getKeycloakToken(serviceAuth);
  //     if (cipher === '') {
  //       failedCount += 1;
  //       errorList.push({
  //         code: GET_CIPHER_FAILED,
  //         message: `[getScooterBill] parameters: ${JSON.stringify(
  //           newParameters
  //         )}, get cipher failed`,
  //       });
  //     }

  //     const genHeaders = {
  //       'Go-Client': GOAUTH_SVC_CLIENT_ID,
  //       Authorization: `Bearer ${cipher}`,
  //     };

  //     try {
  //       const response = await axios.post(apiUrl, newParameters, {
  //         genHeaders,
  //       });
  //       const { code } = response.data;

  //       if (code === 0) {
  //         logger.info(
  //           `parameters: ${JSON.stringify(
  //             newParameters
  //           )}, generate bill success`
  //         );
  //       } else {
  //         logger.error(
  //           `parameters: ${JSON.stringify(newParameters)}, generate bill failed`
  //         );
  //       }

  //       return response.data;
  //     } catch (err) {
  //       logger.error(`Send generate bill to billing-engine failed, ${err}`);

  //       failedCount += 1;

  //       return {
  //         code: SEND_REQUEST_TO_BILLING_ENGINE_FAILED,
  //         message: `parameters: ${JSON.stringify(
  //           newParameters
  //         )} send data to billing-engine failed`,
  //       };
  //     }
  //   },
  //   { concurrency: BILLLING_ENGINE_REQUEST_CONCURRENT }
  // );
};

export default generateScooterBill;
