import { HStack, SimpleGrid, Stack } from '@chakra-ui/react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import {
  SkeletonBlock, SkeletonFigure, SkeletonRegion, SkeletonRows,
} from '../../shared/ui/Skeleton.jsx'

// The groups screens while they load, in the shape of what's coming.

// Groups: a few group cards (mark · name over members · balance).
export function GroupsSkeleton() {
  return (
    <SkeletonRegion>
      <Stack spacing={3}>
        {['46%', '34%', '52%'].map((w) => (
          <Panel key={w}>
            <HStack spacing={3}>
              <SkeletonBlock w="44px" h="44px" radius="xl" />
              <Stack spacing={2} flex="1" minW={0}>
                <SkeletonBlock w={w} h="14px" />
                <SkeletonBlock w="30%" h="10px" />
              </Stack>
              <Stack spacing={1.5} align="end">
                <SkeletonBlock w="48px" h="10px" />
                <SkeletonBlock w="64px" h="14px" />
              </Stack>
            </HStack>
          </Panel>
        ))}
      </Stack>
    </SkeletonRegion>
  )
}

// A group: header (mark, name, members, total), your balance with everyone's,
// then the history list.
export function GroupDetailSkeleton() {
  return (
    <SkeletonRegion>
      <Stack spacing={5}>
        <HStack spacing={3} pt={{ base: 10, md: 0 }} pl={{ md: 12 }}>
          <SkeletonBlock w="48px" h="48px" radius="xl" />
          <Stack spacing={2} flex="1" minW={0}>
            <SkeletonBlock w="55%" h="20px" radius="lg" />
            <SkeletonBlock w="35%" h="12px" />
          </Stack>
          <SkeletonFigure size="lg" w="88px" align="end" />
        </HStack>

        <Panel>
          <HStack spacing={3}>
            <SkeletonFigure size="xl" w="140px" flex="1" />
            <SkeletonBlock w="104px" h="32px" radius="lg" />
          </HStack>
          <SimpleGrid columns={2} spacing={2} mt={5}>
            <SkeletonBlock h="52px" radius="lg" />
            <SkeletonBlock h="52px" radius="lg" />
          </SimpleGrid>
          <SkeletonBlock h="40px" radius="xl" mt={3} />
        </Panel>

        <Panel>
          <SkeletonBlock w="260px" maxW="full" h="32px" radius="lg" mb={3} />
          <SkeletonRows count={4} />
        </Panel>
      </Stack>
    </SkeletonRegion>
  )
}
