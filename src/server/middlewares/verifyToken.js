import fs from 'fs';
import jwt from 'jsonwebtoken';
import logger from '../../logger';
import mysqlQuery from '../lib/mysql';

const { PRIVATE_KEY_PATH, JWT_ALG } = process.env;

const verifyToken = async (req, res, next) => {
  const bearerHeader = req.headers.authorization;
  const { mysql } = req;

  // check if bearer is undefined
  if (typeof bearerHeader !== 'undefined') {
    // split the space at the bearer
    const bearer = bearerHeader.split(' ');
    // Get token from string
    const bearerToken = bearer[1];

    try {
      const privateKey = fs.readFileSync(PRIVATE_KEY_PATH);
      const decode = jwt.verify(
        bearerToken,
        privateKey.toString().replace(/\\r\n/gm, '\n'),
        { algorithms: [JWT_ALG] }
      );

      if (!decode.email) {
        res.sendStatus(401).send('Unauthorized');
      } else {
        const sqlString = 'SELECT * FROM tbl_user WHERE `email` = ?';
        const results = await mysqlQuery(sqlString, [decode.email], mysql);

        if (results.length <= 0) {
          res.sendStatus(401).send('Unauthorized');
        } else {
          req.token = bearerToken;
          next();
        }
      }
    } catch (error) {
      logger.error(error);
      res.sendStatus(401).send('Unauthorized');
    }
  } else {
    // Unauthorized
    res.sendStatus(401).send('Unauthorized');
  }
};

export default verifyToken;
