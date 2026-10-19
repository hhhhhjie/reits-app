const { spawn } = require('node:child_process');
const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY || '1' },
});
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
