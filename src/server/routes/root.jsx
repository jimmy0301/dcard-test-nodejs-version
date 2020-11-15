import express from 'express';
import emailValidator from '../middlewares/emailValidator';
import passwordValidator from '../middlewares/passwordValidator';
import getCard from '../api/getCard';
import login from '../api/login';
import signIn from '../api/signIn';
import checkRequestLimit from '../middlewares/checkRequestLimit';
import verifyToken from '../middlewares/verifyToken';

const router = express.Router();

const jsonParser = express.json({ limit: '50mb' });
router.post('/signIn', [jsonParser, emailValidator, passwordValidator], signIn);

router.post('/login', [jsonParser, emailValidator, passwordValidator], login);
router.get('/card', [checkRequestLimit, verifyToken], getCard);

export default router;
