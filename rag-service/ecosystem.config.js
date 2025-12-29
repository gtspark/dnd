module.exports = {
  apps: [{
    name: 'silverpeak-memory',
    script: './venv/bin/python',
    args: 'memory_service.py',
    cwd: '/opt/dnd/rag-service',
    interpreter: 'none',
    env: {
      MEMORY_SERVICE_PORT: 5003
    },
    error_file: '/home/admin/.pm2/logs/silverpeak-memory-error.log',
    out_file: '/home/admin/.pm2/logs/silverpeak-memory-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    restart_delay: 3000,
    autorestart: true,
    watch: false
  }]
};
