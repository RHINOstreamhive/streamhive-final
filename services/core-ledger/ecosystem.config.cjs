// ecosystem.config.cjs (CommonJS so it works even with "type":"module")
module.exports = {
  apps: [
    {
      name: "email-sink",
      cwd: __dirname,                            // run from services/core-ledger
      script: "C:\\Windows\\System32\\cmd.exe",  // launch via cmd.exe
      args: ["/d", "/s", "/c", "npm", "run", "sink:email:watch"],
      interpreter: "none",
      windowsHide: true,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
