// Makes a statement's file off the page's thread (statementJob.js), so a long
// statement — thousands of rows, hundreds of pages — never freezes the app.
// Gets a job; answers { page } as each PDF page is begun, then { bytes }, or
// { error } (the details stay in this console).
import { runStatementJob } from './statementJob.js'

self.onmessage = async ({ data: job }) => {
  try {
    const bytes = await runStatementJob(job, (page) => self.postMessage({ page }))
    self.postMessage({ bytes }, [bytes.buffer])
  } catch (err) {
    console.error('[statements] making the file failed:', err)
    self.postMessage({ error: String(err?.message ?? err) })
  }
}
