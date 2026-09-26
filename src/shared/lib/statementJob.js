// A statement's file made from what the page read for it: the personal
// statement (loadStatement's result, as a PDF or Excel) or the group statement
// (loadGroupStatement's result, a PDF). Runs in statementWorker.js, off the
// page's thread; each job loads only the library its file needs (pdf-lib or
// the app's SheetJS). `onPage` hears each PDF page's number as it is begun.
//
//   { kind: 'personal', format: 'pdf' | 'xlsx', input }
//   { kind: 'group', input }
import { statementBytes } from '../../../supabase/functions/generate-report/statementFile.ts'
import { groupStatementPdf } from '../../../supabase/functions/group-report/groupStatement.ts'

export async function runStatementJob(job, onPage) {
  if (job.kind === 'personal' && job.format === 'xlsx') {
    return statementBytes('xlsx', job.input, { xlsx: await import('xlsx') })
  }
  const pdf = { ...(await import('./pdf.js')).browserPdf, onPage }
  if (job.kind === 'group') return groupStatementPdf(pdf, job.input)
  return statementBytes('pdf', job.input, { pdf })
}
