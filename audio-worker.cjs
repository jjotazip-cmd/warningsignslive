const nativeAudio = require('electron-native-screenshare');

process.parentPort.on('message', event => {
  const message = event.data || {};
  if (message.command === 'stop') {
    try { nativeAudio.stopCapture(); } catch {}
    process.exit(0);
  }
  if (message.command !== 'start') return;
  const pid = Number(message.pid);
  try {
    const started = nativeAudio.startCapture(pid, true, (data, meta) => {
      const pcm = Uint8Array.from(data);
      process.parentPort.postMessage({ type: 'audio', pid, pcm, meta });
    });
    if (!started) throw new Error('A captura de áudio não iniciou.');
    process.parentPort.postMessage({ type: 'started', pid });
  } catch (error) {
    process.parentPort.postMessage({ type: 'error', error: String(error.message || error) });
  }
});
