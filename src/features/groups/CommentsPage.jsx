import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Stack, HStack, Text, Textarea, IconButton, Box } from '@chakra-ui/react'
import { Trash2, Send } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useLiveQuery } from '../../shared/lib/db.js'
import { unsavedFormAttr } from '../../shared/lib/autoUpdate.js'
import { shortDateTime } from '../../shared/lib/dates.js'
import QueryError from '../../shared/ui/QueryError.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { listComments, addComment, deleteComment } from './comments.js'
import { commentTarget } from './groupFormat.js'
import GroupFormPage from './GroupFormPage.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// /groups/:id/comments/:itemId — the comment thread on one expense or
// settlement of the group, under the item's name. Live: new comments from
// other members appear as they're posted. (The group page's comment counts
// catch up when it's opened again.)
export default function CommentsPage() {
  const { itemId } = useParams()
  const t = useT('groups')
  return (
    <GroupFormPage title={t('comments.title')}
      description={(ctx) => commentTarget(ctx, itemId, ctx.myMember?.id)?.label}>
      {(ctx) => {
        const target = commentTarget(ctx, itemId, ctx.myMember?.id)
        return target
          ? <Thread groupId={ctx.group.id} target={target} myMember={ctx.myMember} />
          : <Panel><Text color="text.muted">{t('comments.gone')}</Text></Panel>
      }}
    </GroupFormPage>
  )
}

function Thread({ groupId, target, myMember }) {
  const { user } = useAuth()
  const t = useT('groups')
  const [body, setBody] = useState('')
  const { busy, run } = useAsyncSubmit()

  const { data: comments, loading, error, reload } = useLiveQuery(() => listComments(groupId, target.id), {
    key: `thread:${target.id}`,
    specs: [{ table: 'group_comments', filter: `target_id=eq.${target.id}` }],
    deps: [groupId, target.id],
    initial: [],
    keepPrevious: false,
  })

  async function send(e) {
    e.preventDefault()
    if (!body.trim() || !myMember) return
    await run(async () => {
      await addComment({
        groupId, targetType: target.type, targetId: target.id,
        authorMemberId: myMember.id, body: body.trim(),
      })
      setBody('')
      await reload()
    })
  }

  async function remove(id) {
    await run(async () => {
      await deleteComment(id)
      await reload()
    })
  }

  return (
    <>
      <Panel>
        {error ? (
          <QueryError error={error} onRetry={reload} what={t('comments.what')} py={4} />
        ) : loading ? (
          <RingLoader />
        ) : comments.length === 0 ? (
          <Text color="text.muted" fontSize="sm">{t('comments.empty')}</Text>
        ) : (
          <Stack spacing={4}>
            {comments.map((cm) => (
              <HStack key={cm.id} align="start" spacing={3}>
                <UserAvatar size="xs" name={cm.author?.display_name} />
                <Box flex="1" minW={0}>
                  <HStack spacing={2} mb={0.5} align="center">
                    <Text fontSize="sm" fontWeight="600" minW={0} overflowWrap="anywhere">
                      {cm.author?.display_name || t('member')}
                    </Text>
                    <Text fontSize="xs" color="text.muted">{shortDateTime(cm.created_at)}</Text>
                    <Box flex="1" />
                    {cm.author_id === user?.id && (
                      <IconButton aria-label={t('comments.delete')} size="xs" variant="ghost" color="status.negative"
                        icon={<Trash2 size={13} />} isDisabled={busy} onClick={() => remove(cm.id)} />
                    )}
                  </HStack>
                  <Text fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere">{cm.body}</Text>
                </Box>
              </HStack>
            ))}
          </Stack>
        )}
      </Panel>

      {myMember ? (
        <HStack as="form" onSubmit={send} align="end" spacing={2} {...unsavedFormAttr(!!body.trim())}>
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} bg="bg.surface"
            aria-label={t('comments.write')} placeholder={t('comments.placeholder')} resize="vertical"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e) }} />
          <IconButton type="submit" aria-label={t('comments.send')} icon={<Send size={18} />}
            isLoading={busy} isDisabled={!body.trim()} />
        </HStack>
      ) : (
        <Text fontSize="sm" color="text.muted">{t('comments.joinFirst')}</Text>
      )}
    </>
  )
}
