// Known bank-export layouts. Each preset is recognised by its header row
// (`signature`: every group must match one header) and says which header
// feeds each import field, in every language the bank exports (FR/NL/EN/EL).
// Headers are compared after normHeader(): lowercase, no accents or tonos,
// punctuation as spaces — "Date d'exécution" → "date d execution",
// "Ημ/νία Αξίας" → "ημ νια αξιασ". Pure data + matching; no I/O.
//
// Field keys (see IMPORT_FIELDS in statementDetect.js): date, amount, debit,
// credit, type (a debit/credit marker column), currency, counterparty,
// holder (the account holder's own name), description, details, category,
// status, fee.
import { foldText } from '../../shared/lib/localeParse.js'

export function normHeader(h) {
  return foldText(h).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export const PRESETS = [
  {
    // Easy Banking Web "search & export" CSV (layout since 2018): ";" with
    // decimal commas, dd/mm/yyyy, signed amounts, a Status column
    // (Accepted/Refused). Older exports only had Details for the text.
    id: 'bnp-fortis', name: 'BNP Paribas Fortis',
    signature: [
      ['volgnummer', 'numero de sequence', 'sequence number'],
      ['uitvoeringsdatum', 'date d execution', 'execution date'],
    ],
    columns: {
      date: ['uitvoeringsdatum', 'date d execution', 'execution date'],
      amount: ['bedrag', 'montant', 'amount'],
      currency: ['valuta rekening', 'devise du compte', 'currency of account', 'currency of the account'],
      counterparty: ['naam van de tegenpartij', 'nom de la contrepartie', 'name of the counterparty',
        'tegenpartij van de verrichting'],
      description: ['mededeling', 'communication'],
      details: ['details', 'detail'],
      status: ['status', 'statut'],
    },
    dateOrder: 'dmy', decimal: ',',
  },
  {
    // Home'Bank CSV: ";" decimal commas, dd/mm/yyyy, signed amounts.
    id: 'ing-be', name: 'ING Belgium',
    signature: [
      ['omzetnummer', 'numero de mouvement', 'transaction number'],
      ['boekingsdatum', 'date comptable', 'booking date'],
    ],
    columns: {
      date: ['boekingsdatum', 'date comptable', 'booking date'],
      amount: ['bedrag', 'montant', 'amount'],
      currency: ['munteenheid', 'devise', 'currency'],
      description: ['omschrijving', 'libelles', 'libelle', 'description'],
      details: ['detail van de omzet', 'details du mouvement', 'transaction details'],
    },
    dateOrder: 'dmy', decimal: ',',
  },
  {
    // KBC/CBC Touch & Mobile CSV: ";" decimal commas, dd/mm/yyyy, signed
    // amounts, lines often ending in a bare CR. Rekeningnummer; Rubrieknaam;
    // Naam; Munt; Afschriftnummer; Datum; Omschrijving; Valuta; Bedrag;
    // Saldo; credit; debet; rekeningnummer tegenpartij; BIC tegenpartij;
    // Naam tegenpartij; Adres tegenpartij; gestructureerde mededeling; Vrije
    // mededeling (EN: Account number; Heading; Name; Currency; Statement
    // number; Date; Description; Value date; Amount; … Counterparty name; …
    // Free-format reference). Some exports leave out the Heading column.
    // NB in the Dutch file "Valuta" is the VALUE DATE; the currency is
    // "Munt". "Naam"/"Name" is the ACCOUNT HOLDER on every row, never the
    // counterparty — card rows leave the counterparty columns empty.
    id: 'kbc', name: 'KBC / CBC',
    signature: [
      ['afschriftnummer', 'numero d extrait', 'statement number'],
      ['vrije mededeling', 'communication libre', 'free format reference',
        'gestructureerde mededeling', 'communication structuree', 'standard format reference'],
    ],
    columns: {
      date: ['datum', 'date'],
      amount: ['bedrag', 'montant', 'amount'],
      currency: ['munt', 'devise', 'currency'],
      counterparty: ['naam tegenpartij', 'nom contrepartie', 'nom de la contrepartie', 'counterparty name',
        'counterparty s name', 'name counterparty'],
      holder: ['naam', 'nom', 'name'],
      description: ['omschrijving', 'description'],
      details: ['vrije mededeling', 'communication libre', 'free format reference'],
    },
    dateOrder: 'dmy', decimal: ',',
  },
  {
    // myCrelan CSV: ";" decimal commas, dd/mm/yyyy, signed amounts.
    id: 'crelan', name: 'Crelan',
    signature: [
      ['rekening tegenpartij', 'compte contrepartie', 'compte de la contrepartie'],
      ['type verrichting', 'type d operation', 'type operation'],
      ['mededeling', 'communication'],
    ],
    columns: {
      date: ['datum', 'date'],
      amount: ['bedrag', 'montant'],
      currency: ['munt', 'devise'],
      counterparty: ['tegenpartij', 'contrepartie'],
      description: ['mededeling', 'communication'],
      details: ['type verrichting', 'type d operation', 'type operation'],
    },
    dateOrder: 'dmy', decimal: ',',
  },
  {
    // winbank "Κινήσεις Λογαριασμών" .xlsx: 5–7 preamble lines, then
    // Category / Description / Transaction date / Value date / Comments /
    // Amount / Currency / Running balance / Currency. Signed amounts.
    id: 'piraeus', name: 'Piraeus Bank',
    signature: [
      ['περιγραφη συναλλαγησ'],
      ['ημ νια συναλλαγησ', 'ημερομηνια συναλλαγησ'],
    ],
    columns: {
      date: ['ημ νια συναλλαγησ', 'ημερομηνια συναλλαγησ'],
      amount: ['ποσο'],
      currency: ['νομισμα'],
      description: ['περιγραφη συναλλαγησ'],
      details: ['σχολια κωδικοσ αναφορασ'],
    },
    dateOrder: 'dmy', decimal: ',',
  },
  {
    // myAlpha "Κινήσεις Λογαριασμού" CSV: ";" 4–8 preamble lines, then
    // Α/Α; Ημερομηνία; Αιτιολογία; Κατάστημα; Τοκισμός από; Αρ. συναλλαγής;
    // Ποσό; Πρόσημο ποσού — unsigned amounts with Χ (debit) / Π (credit).
    id: 'alpha', name: 'Alpha Bank',
    signature: [['αιτιολογια'], ['προσημο ποσου']],
    columns: {
      date: ['ημερομηνια', 'ημ νια'],
      amount: ['ποσο'],
      type: ['προσημο ποσου'],
      description: ['αιτιολογια'],
    },
    dateOrder: 'dmy', decimal: ',',
  },
  {
    // Eurobank e-Banking CSV (Greece; Cyprus after the Hellenic Bank merger):
    // ΗΜ/ΝΙΑ ΚΙΝΗΣΗΣ; ΗΜ/ΝΙΑ ΑΞΙΑΣ; ΠΕΡΙΓΡΑΦΗ; ΠΟΣΟ; ΥΠΟΛΟΙΠΟ, account
    // details as footer lines, signed amounts with decimal commas.
    id: 'eurobank', name: 'Eurobank',
    signature: [
      ['ημ νια κινησησ', 'ημερομηνια κινησησ'],
      ['ημ νια αξιασ', 'ημερομηνια αξιασ'],
    ],
    columns: {
      date: ['ημ νια κινησησ', 'ημερομηνια κινησησ'],
      amount: ['ποσο'],
      currency: ['νομισμα'],
      description: ['περιγραφη', 'αιτιολογια'],
    },
    dateOrder: 'dmy', decimal: ',',
  },
  {
    // Revolut personal statement CSV: "," ISO date-times, dot decimals,
    // signed Amount with a separate positive Fee; State is COMPLETED /
    // PENDING / DECLINED / REVERTED / FAILED.
    id: 'revolut', name: 'Revolut',
    signature: [['started date'], ['completed date'], ['state']],
    columns: {
      date: ['started date'],
      amount: ['amount'],
      fee: ['fee'],
      currency: ['currency'],
      description: ['description'],
      status: ['state'],
    },
    dateOrder: 'ymd', decimal: '.',
  },
  {
    // Revolut Business statement CSV: Total amount already includes fees.
    id: 'revolut-business', name: 'Revolut Business',
    signature: [['date started utc'], ['total amount'], ['state']],
    columns: {
      date: ['date started utc'],
      amount: ['total amount'],
      currency: ['payment currency'],
      description: ['description'],
      details: ['reference'],
      status: ['state'],
    },
    dateOrder: 'ymd', decimal: '.',
  },
]

// Index of the header matching one of `aliases` (exact beats "starts with",
// earlier aliases beat later ones), skipping indexes in `taken`; -1 if none.
export function findHeader(normHeaders, aliases, taken = new Set()) {
  for (const exact of [true, false]) {
    for (const a of aliases) {
      const i = normHeaders.findIndex((h, j) => !taken.has(j)
        && (exact ? h === a : h.startsWith(`${a} `)))
      if (i !== -1) return i
    }
  }
  return -1
}

// The preset whose signature this header row carries (most matched columns
// wins), with its column mapping, or null.
export function matchPreset(headers) {
  const norm = headers.map(normHeader)
  let best = null
  for (const preset of PRESETS) {
    if (!preset.signature.every((group) => findHeader(norm, group) !== -1)) continue
    const mapping = {}
    const taken = new Set()
    for (const [field, aliases] of Object.entries(preset.columns)) {
      const i = findHeader(norm, aliases, taken)
      if (i === -1) continue
      mapping[field] = headers[i]
      taken.add(i) // one field per column
    }
    const score = Object.keys(mapping).length + preset.signature.length
    if (mapping.date && (mapping.amount || (mapping.debit && mapping.credit))
      && (!best || score > best.score)) {
      best = { preset, mapping, score }
    }
  }
  return best && { preset: best.preset, mapping: best.mapping }
}
