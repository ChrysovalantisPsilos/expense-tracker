import { createContext, useContext } from 'react'

// True for pages rendered inside the signed-in app shell (AppShell provides
// it). Pages readable anywhere (Help, the Privacy Notice, the Terms) use it to
// pick their frame: the shell's page header inside it, their own full-page
// layout outside it — signed out, or signed in while the legal prompt stands
// in for the app (App.jsx).
export const InAppShell = createContext(false)

export const useInAppShell = () => useContext(InAppShell)
