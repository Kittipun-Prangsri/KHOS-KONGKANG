module.exports = {
  apps: [
    {
      name: 'computer-material-stock-api',
      script: 'backend-api/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
        DB_HOST: 'localhost',
        DB_USER: 'root',
        DB_PASSWORD: '',
        DB_NAME: 'computer_stock',
        DB_PORT: 3306
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
        DB_HOST: 'localhost',
        DB_USER: 'stock_app',
        DB_PASSWORD: 'secure_password_here',
        DB_NAME: 'computer_stock',
        DB_PORT: 3306
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      combine_logs: true,
      time: true
    }
  ]
};
