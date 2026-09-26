import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { FormControl, FormHelperText, FormLabel, Input, Select, Stack, Text, useToast } from '@chakra-ui/react'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { minorToInput, toMinor } from '../../shared/lib/currency.js'
import { useAccounts, saveAccount } from './insights.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A net-worth account's page (a balance you keep up to date by hand):
//   /insights/accounts/new   a new account
//   /insights/accounts/:id   an existing one (Insights passes it in router
//                            state; a reload finds it in the list)
// Saving goes back to wherever the user came from, else Insights.
export default function AccountPage() {
  const { id } = useParams()
  const location = useLocation()
  const t = useT('insights')
  const { baseCurrency, profile, loading: profileLoading } = useProfile()
  const { accounts, loading, error, reload } = useAccounts()
  const passed = location.state?.account
  const account = id ? accounts.find((a) => a.id === id) ?? (passed?.id === id ? passed : null) : null

  let body
  if (id && !account && error) body = <Panel><QueryError error={error} onRetry={reload} what={t('account.what')} /></Panel>
  else if ((id && !account && loading) || (!profile && profileLoading)) body = <RingLoader />
  else if (id && !account) body = <Panel><Text color="text.muted">{t('account.gone')}</Text></Panel>
  else body = <AccountForm key={account?.id ?? 'new'} account={account} baseCurrency={baseCurrency} />

  return (
    <FormPage eyebrow={t('account.eyebrow')} title={t(id ? 'account.titleEdit' : 'account.titleNew')} fallback="/insights">
      {body}
    </FormPage>
  )
}

function AccountForm({ account, baseCurrency }) {
  const toast = useToast()
  const t = useT('insights')
  const back = useGoBack('/insights')
  const isEdit = !!account
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState(account?.type ?? 'asset')
  const [balance, setBalance] = useState(account ? minorToInput(account.balance_minor, account.currency) : '')
  const [currency] = useState(account?.currency ?? baseCurrency)
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!name.trim()) return toast({ title: t('account.nameIt'), status: 'warning' })
    await run(async () => {
      await saveAccount({
        id: account?.id, name: name.trim(), type,
        balance_minor: toMinor(Number(balance) || 0, currency), currency,
      })
      back()
    })
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel={t(isEdit ? 'account.save' : 'account.add')}>
      <Stack spacing={4}>
        <FormControl isRequired>
          <FormLabel>{t('account.name')}</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('account.nameHint')} />
        </FormControl>
        <FormControl>
          <FormLabel>{t('account.type')}</FormLabel>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="asset">{t('account.asset')}</option>
            <option value="liability">{t('account.liability')}</option>
            <option value="savings">{t('account.savings')}</option>
          </Select>
          {type === 'savings' && (
            <FormHelperText>{t('account.savingsHint')}</FormHelperText>
          )}
        </FormControl>
        <FormControl isRequired>
          <FormLabel>{t('account.balance', { currency })}</FormLabel>
          <MoneyInput allowNegative currency={currency} value={balance} onChange={setBalance} placeholder="0" />
        </FormControl>
      </Stack>
    </PageForm>
  )
}
