module.exports = {
  apps: [{
    name: 'zxzh',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // 自动重启
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // 内存限制
    max_memory_restart: '500M',
    // 监控
    watch: false,
    // 集群模式（如需多核利用，改为 'cluster' 和 instances: 'max'）
  }]
};
