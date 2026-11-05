const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  apps: [
    {
      name: 'KONGKANG-stock-api',
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || 5189,
        DB_HOST: process.env.DB_HOST || 'localhost',
        DB_USER: process.env.DB_USER || 'root',
        DB_PASSWORD: process.env.DB_PASSWORD || '',
        DB_NAME: process.env.DB_NAME || 'computer_stock',
        DB_PORT: process.env.DB_PORT || 3306,
        HOSOFFICE_DB_HOST: process.env.HOSOFFICE_DB_HOST || '',
        HOSOFFICE_DB_PORT: process.env.HOSOFFICE_DB_PORT || '',
        HOSOFFICE_DB_USER: process.env.HOSOFFICE_DB_USER || '',
        HOSOFFICE_DB_PASSWORD: process.env.HOSOFFICE_DB_PASSWORD || '',
        HOSOFFICE_DB_NAME: process.env.HOSOFFICE_DB_NAME || '',
        HOSOFFICE_INVEN_ID: process.env.HOSOFFICE_INVEN_ID || '',
        SYNC_FROM_DATE: process.env.SYNC_FROM_DATE || '',
        SYNC_INTERVAL_MIN: process.env.SYNC_INTERVAL_MIN || '',
        HR_TABLE: process.env.HR_TABLE || '',
        HR_ID_COL: process.env.HR_ID_COL || '',
        HR_USER_COL: process.env.HR_USER_COL || '',
        HR_PASS_COL: process.env.HR_PASS_COL || '',
        HR_PASS_ALGO: process.env.HR_PASS_ALGO || '',
        HR_NAME_COLS: process.env.HR_NAME_COLS || '',
        HR_ACTIVE_COL: process.env.HR_ACTIVE_COL || '',
        HR_ACTIVE_VALUE: process.env.HR_ACTIVE_VALUE || '',
        COOKIE_SECURE: process.env.COOKIE_SECURE || '',
        SESSION_HOURS: process.env.SESSION_HOURS || '',
        APP_SECRET: process.env.APP_SECRET || '',
        TRUST_PROXY: process.env.TRUST_PROXY || '',
        HOST: process.env.HOST || '0.0.0.0',
        CORS_ORIGINS: process.env.CORS_ORIGINS || ''
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5189
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      combine_logs: true,
      time: true
    }
  ]
};
