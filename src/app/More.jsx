import { useNavigate } from 'react-router-dom'
import {
  Stack, Card, CardBody, HStack, Text, Box, Divider, Flex,
} from '@chakra-ui/react'
import {
  TrendingUp, Repeat, Search, User, ChevronRight,
} from 'lucide-react'
import PageHeader from '../shared/ui/PageHeader.jsx'

const LINKS = [
  { to: '/insights', label: 'Insights', desc: 'Trends, net worth & goals', icon: TrendingUp },
  { to: '/recurring', label: 'Recurring', desc: 'Subscriptions & recurring bills', icon: Repeat },
  { to: '/search', label: 'Search', desc: 'Find any transaction', icon: Search },
  { to: '/profile', label: 'Profile', desc: 'Statement export, account & settings', icon: User },
]

export default function More() {
  const navigate = useNavigate()
  return (
    <Stack spacing={5}>
      <PageHeader title="More" />
      <Card><CardBody p={0}>
        <Stack spacing={0} divider={<Divider />}>
          {LINKS.map(({ to, label, desc, icon: Icon }) => (
            <HStack key={to} as="button" textAlign="left" spacing={3} px={4} py={3.5}
              _hover={{ bg: 'bg.subtle' }} onClick={() => navigate(to)}>
              <Flex boxSize="40px" borderRadius="xl" bg="bg.subtle" color="accent.fg"
                align="center" justify="center" flexShrink={0}><Icon size={20} /></Flex>
              <Box flex="1">
                <Text fontWeight="600">{label}</Text>
                <Text fontSize="sm" color="text.muted">{desc}</Text>
              </Box>
              <Box color="text.muted"><ChevronRight size={18} /></Box>
            </HStack>
          ))}
        </Stack>
      </CardBody></Card>
    </Stack>
  )
}
