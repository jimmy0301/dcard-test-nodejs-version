import express from 'express';
import passport from 'passport';
import emailValidator from '../middlewares/emailValidator';
import passwordValidator from '../middlewares/passwordValidator';
import { getJob } from '../api/getCard';
import login from '../api/login';
import signIn from '../api/signIn';
import '../lib/utils/passport';
import checkRequestLimit from '../middlewares/checkRequestLimit';

const router = express.Router();

const jsonParser = express.json({ limit: '50mb' });
router.post('/signIn', [jsonParser, emailValidator, passwordValidator], signIn);

router.post('/login', [jsonParser, emailValidator, passwordValidator], login);
router.get(
  '/card',
  [checkRequestLimit, passport.authenticate('bearer', { session: false })],
  getJob
);

export default router;
