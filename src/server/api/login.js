import jwt from 'jsonwebtoken';
import Hashids from 'hashids';
import bcrypt from 'bcrypt';
import fs from 'fs';
import mysqlQuery from '../mysql';
import logger from '../../logger';

const { JWT_ALG, TOKEN_EXPIRED, PRIVATE_KEY_PATH } = process.env;

const login = async (req, res) => {
  const { email, password } = req.body;
  const { mysql } = req;
  const sqlString = 'SELECT * FROM tbl_user WHERE `email` = ?';
  let results = [];

  try {
    results = await mysqlQuery(sqlString, [email], mysql);

    if (results.length <= 0) {
      res.json({ code: -1, message: 'Invalid password or email' });
    } else {
      const hashIds = new Hashids('Jimmy test', 8);
      const afterHashId = hashIds.encode(results[0].user_id);
      const hashPassword = results[0].password;
      const passwordCompareRes = await bcrypt.compare(password, hashPassword);

      if (passwordCompareRes) {
        const privateKey = fs.readFileSync(PRIVATE_KEY_PATH);
        const token = jwt.sign(
          { email, user_id: afterHashId },
          privateKey.toString().replace(/\\r\n/gm, '\n'),
          {
            algorithm: JWT_ALG,
            expiresIn: parseInt(TOKEN_EXPIRED, 10),
          }
        );

        console.log(token);
        res.json({ user_id: afterHashId, email, token });
      } else {
        res.json({ code: -1, message: 'Invalid password or email' });
      }
    }
  } catch (error) {
    logger.error(`Get the user data failed, ${error}`);

    res.json({ code: -1, message: 'Get user data failed' });
  }
};

export default login;
