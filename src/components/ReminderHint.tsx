import { deviceName, inMacApp, inNativeApp, useMacIphoneEnabled, useMacRemindersEnabled } from '@/lib/native'

/** Says where a reminder will reach you, under the reminder field in the task and event dialogs. */
export function ReminderHint() {
  const notifications = useMacRemindersEnabled()
  const iphone = useMacIphoneEnabled()
  if (!inNativeApp) return <>You’ll get a notification from the Daily Tracker app on your Mac or iPhone at this time.</>
  if (!notifications) return <>{deviceName} notifications are off in Settings, so this only shows while the app is open.</>
  return <>You’ll get a notification at this time{inMacApp && iphone ? ', on this Mac and your iPhone' : ''}.</>
}
