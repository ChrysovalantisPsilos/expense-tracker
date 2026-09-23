import { Center, Spinner } from '@chakra-ui/react'

// The app's page-level loading state: a brand spinner centred in the
// content area, or across the whole viewport with `fullScreen` (before the
// shell exists — auth bootstrap, public pages, lazy route chunks).
export default function PageSpinner({ fullScreen = false }) {
  return fullScreen
    ? <Center h="100dvh"><Spinner size="lg" color="brand.500" /></Center>
    : <Center py={16}><Spinner color="brand.500" /></Center>
}
