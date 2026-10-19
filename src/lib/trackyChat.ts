/** Where Tracky's chat is kept on this device (components/Tracky.tsx reads and writes it). */
export const TRACKY_CHAT_KEY = 'dt-tracky-chat'

/** Signing out forgets the chat, so the next person on this computer doesn't see it. */
export function forgetTrackyChat() {
  try {
    localStorage.removeItem(TRACKY_CHAT_KEY)
  } catch {
    // Blocked storage held nothing to forget.
  }
}
