// Deployment config for maava-new, sized to share a 2-core box with the
// existing maava app. Distinct process names and ports so nothing collides.
module.exports = {
  apps: [
    { name: "mvn-api", cwd: "/root/maava-new/Backend", script: "server.js",
      instances: 1, exec_mode: "fork", autorestart: true, max_memory_restart: "500M",
      env: { NODE_ENV: "production", PORT: 5100, SOCKET_PORT: 5101 } },
    { name: "mvn-socket", cwd: "/root/maava-new/Backend", script: "socket-server.js",
      instances: 1, exec_mode: "fork", autorestart: true, max_memory_restart: "300M",
      env: { NODE_ENV: "production", SOCKET_PORT: 5101 } },
    { name: "mvn-scheduler", cwd: "/root/maava-new/Backend", script: "scripts/run-scheduled-jobs.js",
      instances: 1, exec_mode: "fork", autorestart: true, max_memory_restart: "250M",
      env: { NODE_ENV: "production" } }
  ]
};
