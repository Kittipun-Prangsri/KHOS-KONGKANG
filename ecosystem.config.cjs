const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  apps: [
    {
      name: 'KONGKANG-stock-api',
      script: 'backend-api/server.js',
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
        AUTH_USER: process.env.AUTH_USER || '',
        AUTH_PASSWORD: process.env.AUTH_PASSWORD || '',
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
