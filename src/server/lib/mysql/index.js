import logger from '../../../logger';

const mysqlQuery = (sqlStr, value, mysqlClient) => {
  return new Promise((resolve, reject) => {
    mysqlClient.query(sqlStr, value, (error, results) => {
      if (error) {
        logger.error(`Sql statement: ${sqlStr} get Data failed, ${error}`);
        return reject(error);
      }

      return resolve(results);
    });
  });
};

export default mysqlQuery;
