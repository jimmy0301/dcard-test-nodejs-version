import {} from 'dotenv/config';
import http from 'http';
import logger from './logger';
import app from './server';

const { HTTP_PORT = 3000 } = process.env;
const server = http.createServer(app);
server.setTimeout(1000000);

server.on('error', error => {
  logger.error(`Server Launch Failed: ${JSON.stringify(error)}`);
});
server.on('listening', () => {
  const info = server.address();
  const { address, port } = info;
  logger.info(`Server Launched: ${address} ${port}`);
});
server.listen(HTTP_PORT);
