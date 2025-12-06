const { spawn } = require('child_process');
const path = require('path');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function build() {
  const platform = process.platform;
  const serverDir = path.join(__dirname, 'raffi-server');
  
  if (platform === 'win32') {
    console.log('Building Windows binary...');
    await runCommand('go', ['build', '-o', '../electron/decoder-windows-amd64.exe', '.'], {
      cwd: serverDir,
      shell: true
    });
  } else if (platform === 'linux') {
    console.log('Building Linux binary...');
    await runCommand('go', ['build', '-o', '../electron/decoder-x86_64-unknown-linux-gnu', '.'], {
      cwd: serverDir,
      shell: true
    });
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  
  console.log('Binary built successfully');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
