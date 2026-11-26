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
    if (typeof nativeAudio.isAvailable === 'function' && !nativeAudio.isAvailable()) {
      const loadError = typeof nativeAudio.getLoadError === 'function' ? nativeAudio.getLoadError() : null;
      throw new Error('Módulo nativo de áudio indisponível.' + (loadError ? ' ' + loadError : ''));
    }
    const started = nativeAudio.startCapture(pid, message.includeMode === true, (data, meta) => {
      const pcm = Uint8Array.from(data);
      process.parentPort.postMessage({ type: 'audio', pid, pcm, meta });
    });
    if (!started) throw new Error('A captura nativa retornou “não iniciada” para o PID ' + pid + '. Confira se o aplicativo continua aberto e reproduzindo áudio; atualize a lista e tente de novo.');
    process.parentPort.postMessage({ type: 'started', pid });
  } catch (error) {
    const detail = error && error.message && error.message !== 'Error' ? error.message : error && error.stack ? error.stack : String(error);
    process.parentPort.postMessage({ type: 'error', error: String(detail) });
  }
});
