import { createApp } from './app.js';

const { app, config } = createApp();

if (config.devOtp && process.env.NODE_ENV === 'production') {
  console.error('Refusing to start: DEV_OTP must not be set in production.');
  process.exit(1);
}

if (config.adminLoginCode && config.adminLoginCode.length < 12) {
  console.error('ADMIN_LOGIN_CODE must be at least 12 characters.');
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`Surplus Build listening on http://localhost:${config.port}`);
  if (!config.anthropicKey) console.log('ANTHROPIC_API_KEY not set: photo AI check is skipped, rule checks still run.');
});
