// Runs a statement job (statementJob.js) in its Web Worker and resolves with
// the file's bytes. `onProgress` hears the PDF page being made; `signal`
// (deviceFirst's time limit) stops the worker and rejects with its reason.
// Where a worker can't be had, this rejects too, and the statement comes
// from the server (deviceFirst.js).
export function statementOffThread(job, { onProgress, signal } = {}) {
  if (signal?.aborted) return Promise.reject(signal.reason)
  const worker = new Worker(new URL('./statementWorker.js', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    const settle = (fn, value) => {
      worker.terminate()
      signal?.removeEventListener('abort', aborted)
      fn(value)
    }
    const aborted = () => settle(reject, signal.reason)
    signal?.addEventListener('abort', aborted)
    worker.onmessage = ({ data }) => {
      if (data.page) onProgress?.(data.page)
      else if (data.bytes) settle(resolve, data.bytes)
      else settle(reject, new Error(`statement worker: ${data.error}`))
    }
    // The worker couldn't start (no module workers, say).
    worker.onerror = (e) => settle(reject, new Error(`statement worker: ${e.message || 'failed to start'}`))
    worker.postMessage(job)
  })
}
