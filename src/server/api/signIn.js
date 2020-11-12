import bcrypt from 'bcrypt';
import moment from 'moment-timezone';
import logger from '../../logger';
import mysqlQuery from '../mysql';

const { SALT = 10 } = process.env;

const signIn = async (req, res) => {
  const { email, password } = req.body;
  const { mysql } = req;

  let sqlString = 'SELECT * FROM tbl_user WHERE `email` = ?';
  let results = [];

  try {
    results = await mysqlQuery(sqlString, [email.trim()], mysql);

    if (results.length <= 0) {
      try {
        const hashPassword = await bcrypt.hash(password, parseInt(SALT, 10));

        const timeNow = moment().unix();
        sqlString =
          'INSERT INTO tbl_user (email, password, create_time, update_time, last_login_time) VALUES(?, ?, ?, ?, ?)';

        results = await mysqlQuery(
          sqlString,
          [email.trim(), hashPassword, timeNow, timeNow, timeNow],
          mysql
        );

        if (results.affectedRows > 0) {
          logger.info(`Insert the user: ${email} successfully`);

          res.json({ code: 0, message: 'Sign in successfully' });
        } else {
          logger.info(`Insert the user: ${email} failed`);

          res.json({ code: 0, message: 'Sign in failed' });
        }
      } catch (error) {
        logger.error(`Encrypt user password failed`);

        res.json({ code: -1, message: 'Encrypt user password failed' });
      }
    } else {
      res.json({ code: -1, message: 'The email has already existed' });
    }
  } catch (error) {
    logger.error(`Get the user data failed, ${error}`);

    res.json({ code: -1, message: 'Get user data failed' });
  }
};

export default signIn;
