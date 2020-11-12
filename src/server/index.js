import config from 'config';
import redis from 'redis';
import mysql from 'mysql';
import addRequestId from 'express-request-id';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import express from 'express';
import inject from './middlewares/injectServiceMiddleware';

// Route definitions
import routerRoot from './routes/root';

const {
  MYSQL_HOST,
  MYSQL_PORT,
  MYSQL_USER,
  MYSQL_USER_PASSWORD,
  MYSQL_DATABASE,
  REDIS_SHARED_HOST,
  REDIS_SHARED_PORT,
  REDIS_SHARED_PASS,
  REDIS_SHARED_DB,
  REDIS_SHARED_TLS_ENABLED,
  REDIS_SHARED_PREFIX_SESSION,
} = process.env;

const app = express();
const swaggerDocument = YAML.load('swagger.yaml');

// connect redis
const redisClient = redis.createClient({
  port: REDIS_SHARED_PORT,
  host: REDIS_SHARED_HOST,
  db: Number(REDIS_SHARED_DB),
  tls:
    REDIS_SHARED_TLS_ENABLED === 'true'
      ? { servername: REDIS_SHARED_HOST }
      : null,
  password: REDIS_SHARED_PASS,
  prefix: REDIS_SHARED_PREFIX_SESSION,
});

// connect mysql
const mysqlPool = mysql.createPool({
  connectionLimit: 10,
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_USER_PASSWORD,
  database: MYSQL_DATABASE,
});

// Setup
app.use(inject('redis', redisClient));
app.use(inject('mysql', mysqlPool));

// Static assets
app.use(express.static(config.server.static));

// Routes
app.use(addRequestId({ setHeader: false }));
app.use('/', routerRoot);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

export default app;
