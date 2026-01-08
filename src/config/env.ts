export default () => ({
  PORT: parseInt(process.env.PORT || '3001', 10),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/smart_restaurant',

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
  ACCESS_EXPIRES_IN: process.env.ACCESS_EXPIRES_IN || '15m',
  REFRESH_EXPIRES_IN: process.env.REFRESH_EXPIRES_IN || '30d',

  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5174',
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
});
