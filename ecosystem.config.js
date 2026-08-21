// PM2 production process config for max-mcp-server
// Usage: pm2 start ecosystem.config.js

const APP_DIR = process.env.APP_DIR || __dirname;

module.exports = {
  apps: [
    {
      name: "max-mcp-server",
      script: ".next/standalone/server.js",
      cwd: APP_DIR,
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 15000,

      env: {
        NODE_ENV: "production",
        PORT: 3001,
        HOSTNAME: "0.0.0.0",
      },

      max_memory_restart: "200M",
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",

      error_file: "/var/log/max-mcp-server-error.log",
      out_file: "/var/log/max-mcp-server-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
