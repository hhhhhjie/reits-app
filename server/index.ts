import { createApp } from './app';

const port = Number(process.env.PORT || 3000);
const server = createApp().listen(port, '0.0.0.0', () =>
  console.log(`知行行情服务已启动，端口 ${port}`),
);
function close() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
