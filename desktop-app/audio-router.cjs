const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const path = require('node:path');
const { app } = require('electron');

function helper() {
  return app.isPackaged ? path.join(process.resourcesPath, 'ws-audio.exe')
    : path.join(__dirname, 'native', 'build', 'Release', 'ws-audio.exe');
}
async function sessions(blocked = []) {
  const { stdout } = await run(helper(), ['sessions', ...blocked.map(String)], { windowsHide: true, timeout: 4000 });
  return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [id, name] = line.split('\t');
    return { pid: Number(id), name: (name || id).replace(/\.exe$/i, '') };
  }).filter(item => item.pid > 0 && item.pid !== process.pid);
}
async function windowPid(sourceId) {
  const match = /^window:(\d+):/.exec(sourceId);
  if (!match) return 0;
  const { stdout } = await run(helper(), ['window', match[1]], { windowsHide: true, timeout: 4000 });
  return Number(stdout.trim()) || 0;
}

let generation = 0;
let interval;
const workers = new Map();
function stop() {
  generation++;
  clearInterval(interval);
  for (const child of workers.values()) child.kill();
  workers.clear();
}
function startWorker(pid, mode, send) {
  return new Promise((resolve, reject) => {
    const child = spawn(helper(), [mode, String(pid)], { windowsHide:true, stdio:['ignore','pipe','pipe'] });
    workers.set(pid,child);
    let detail = '', ready = false, tail = Buffer.alloc(0);
    let finished = false;
    const timeout = setTimeout(() => {
      finish(new Error(detail.trim() || 'O capturador não confirmou a inicialização em 8 segundos.'));
      child.kill();
    }, 8000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      detail = (detail + chunk).slice(-2048);
      if (!ready && /(?:^|\n)READY\r?\n/.test(detail)) { ready = true; clearTimeout(timeout); resolve(); }
    });
    child.stdout.on('data', chunk => {
      if (workers.get(pid) !== child) return;
      const buffer = tail.length ? Buffer.concat([tail, chunk]) : chunk;
      const end = buffer.length - buffer.length % 4;
      tail = buffer.subarray(end);
      if (end) send('desktop:audio-data',{pid,pcm:buffer.subarray(0,end),meta:{channels:2,bitsPerSample:16,isFloat:false,sampleRate:44100}});
    });
    const finish = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (workers.get(pid) === child) {
        workers.delete(pid);
        if (ready) send('desktop:audio-error',{pid,error:error.message});
      }
      reject(error);
    };
    child.on('error',finish);
    child.on('close', (code, signal) => {
      const diagnostic = detail.replace(/^READY\r?$/m, '').trim();
      const status = code === null ? (signal || 'sem código de saída') : 'código ' + code;
      finish(new Error(diagnostic || 'Capturador encerrado (' + status + ').'));
    });
  });
}
async function start(ids, include, blocked, send) {
  stop();
  const token = generation;
  if (blocked?.length > 1) {
    let busy = false;
    async function refresh() {
      if (busy || generation !== token) return;
      busy = true;
      try {
        const apps = await sessions([...blocked,process.pid]);
        if (generation !== token) return;
        const allowed = new Set(apps.map(a=>a.pid));
        for (const [pid, child] of workers) if (!allowed.has(pid)) {workers.delete(pid);child.kill();}
        await Promise.all([...allowed].filter(pid=>!workers.has(pid)).map(pid=>startWorker(pid,'include',send)));
      } finally { busy = false; }
    }
    await refresh();
    if (generation !== token) throw new Error('Captura cancelada.');
    interval=setInterval(()=>refresh().catch(e=>send('desktop:audio-error',{error:e.message})),2000);
    return {monitoring:true,started:[...workers.keys()],failed:[]};
  }
  const targets=[...new Set(ids.map(pid=>pid===0&&!include?process.pid:pid))];
  await Promise.all(targets.map(pid=>startWorker(pid,include?'include':'exclude',send)));
  return {started:targets,failed:[]};
}
module.exports={sessions,windowPid,start,stop};
