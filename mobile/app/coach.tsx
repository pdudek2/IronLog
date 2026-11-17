import CoachPlanPanel from '../src/CoachPlanPanel'
import BottomNavigation, { useBottomNavigation, useNavigationInset } from '../src/BottomNavigation'
import { KeyboardLift } from '../src/KeyboardLift'
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'
import { readRecentWorkouts } from '../src/firebase'
import type { SavedWorkout } from '../src/history'
import { lastWorkoutRead } from '../../src/shared/lastWorkoutRead'
import HistoryHeader from '../src/HistoryHeader'
import { CoachController } from '../src/coachController'
import { nativeCoachDependencies } from '../src/coachNative'
import { markdownBlocks, markdownInline } from '../src/coachMarkdown'
import type { AiContextMetadata } from '../../src/lib/aiContext'
import { colors, pageTitle, primaryGradient } from '../src/theme'
import { BottomSheet } from '../src/BottomSheet'
import { Icon } from '../src/icons'
import { resetTimeLabel } from '../../src/shared/coachQuota'

const prompts = ['Analyze my last week of training.', 'What should I focus on in my next upper body workout?', 'Does my readiness suggest a harder or lighter session today?']
export default function CoachScreen() {
  const { user } = useAuthRuntime()
  return user ? <Coach key={user.uid} uid={user.uid} /> : null
}
function Button({ children, onPress, disabled = false, primary = false, label }: {
  children: React.ReactNode; onPress: () => void; disabled?: boolean; primary?: boolean; label?: string
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[s.button, primary && s.primary, disabled && s.disabled]}>
    {typeof children === 'string' ? <View style={s.buttonContent}>{(children === 'Send' || children === 'Sending…' || label === 'Reset conversation') && <Svg width={14} height={14} viewBox="0 0 24 24"><Path d={label === 'Reset conversation' ? 'M3 10a9 9 0 1 1 1 7M3 4v6h6' : 'm22 2-7 20-4-9-9-4 20-7ZM22 2 11 13'} fill="none" stroke={primary ? colors.onPrimary : colors.muted} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>}<Text style={[s.buttonText, primary && s.primaryText]}>{children}</Text></View> : children}
  </Pressable>
}
function Markdown({ content }: { content: string }) {
  const blocks = markdownBlocks(content)
  return <View>{blocks.map((block, i) => <Text selectable key={i}
    style={[s.body, { marginTop: i === 0 ? 0 : block.kind === 'item' && blocks[i - 1]?.kind === 'item' && (block.marker === '•') === (blocks[i - 1]?.marker === '•') ? 5.6 : 14.4 }, block.kind === 'heading' && [s.markdownHeading, { fontSize: block.level === 1 ? 20 : block.level === 2 ? 18.4 : 16.8 }], block.kind === 'item' && { paddingLeft: Math.min(block.level, 8) * 17.6 }]}>
    {block.marker ? `${block.marker}  ` : ''}{markdownInline(block.text).map((part, j) => <Text key={j}
      style={part.kind === 'bold' ? s.bold : part.kind === 'italic' ? s.italic : part.kind === 'code' ? s.code : undefined}>{part.text}</Text>)}
  </Text>)}</View>
}
function ContextNotice({ context }: { context?: AiContextMetadata }) {
  return context?.status === 'limited' ? <Text style={s.context}>Response was created with some data unavailable: {context.unavailableSources.join(', ')}.</Text> : null
}
function Coach({ uid }: { uid: string }) {
  const navigation = useBottomNavigation()
  const navigationInset = useNavigationInset()
  const [, redraw] = useState(0)
  const [controller] = useState(() => new CoachController(nativeCoachDependencies(uid), () => redraw(value => value + 1)))
  const state = controller.state
  const [tab, setTab] = useState<'chat' | 'plan'>('chat')
  const units = useActiveRuntime().state.units
  const [lastWorkout, setLastWorkout] = useState<SavedWorkout | null>(null)
  useEffect(() => {
    let live = true
    void readRecentWorkouts(uid, 1).then(({ data }) => { if (live) setLastWorkout(data[0] ?? null) }).catch(() => undefined)
    return () => { live = false }
  }, [uid])
  const read = lastWorkout ? lastWorkoutRead(lastWorkout, units) : null
  const [settings, setSettings] = useState(false)
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [input, setInput] = useState('')
  const outer = useRef<KeyboardAwareScrollViewRef>(null)
  const nearBottom = useRef(true)
  const [more, setMore] = useState(false)
  const conversation = state.messages.length > 0
  const configured = controller.ownKey
  const ready = configured || controller.sharedReady
  const sharedOff = !configured && state.quota?.shared === false
  const limit = controller.activeLimit
  const allowance = configured ? null
    : limit ? (limit.code === 'daily-limit' ? `Today's Coach limit is used up. It resets at ${resetTimeLabel(limit.resetAt)}.` : `Coach has reached today's limit for everyone. It resets at ${resetTimeLabel(limit.resetAt)}.`)
    : state.quota ? `${controller.remaining} of ${state.quota.limit} left today` : null
  useEffect(() => { void controller.load(); return () => controller.dispose() }, [controller])
  useFocusEffect(useCallback(() => {
    controller.setActive(AppState.currentState === 'active')
    const subscription = AppState.addEventListener('change', next => { controller.setActive(next === 'active'); if (next !== 'active') setReveal(false) })
    return () => { subscription.remove(); controller.setActive(false); setReveal(false) }
  }, [controller]))
  const openSettings = () => { setDraft(state.key); setReveal(false); setSettings(true) }
  const send = (text: string) => {
    nearBottom.current = true
    if (controller.send(text)) setInput('')
  }
  const saveKey = async (key: string) => {
    if (await controller.saveKey(key)) { setDraft(''); setReveal(false); setSettings(!key) }
  }
  const keyPanel = settings ? <View style={s.settings}>
    <View style={s.row}><Text style={s.settingsTitle}>OpenRouter key</Text><Button onPress={() => { setSettings(false); setDraft(''); setReveal(false) }}>{state.key ? 'Collapse' : 'Cancel'}</Button></View>
    <Text style={s.label}>Your key</Text>
    <TextInput accessibilityLabel="Your OpenRouter key" value={draft} onChangeText={setDraft} secureTextEntry={!reveal} selectionColor={colors.selection}
      editable={!state.keyLoading && !state.keySaving && !state.storageError} autoCorrect={false} autoCapitalize="none" autoComplete="off" maxLength={4096}
      placeholder="Paste OpenRouter API key" placeholderTextColor={colors.mutedSoft} style={s.keyInput} />
    <View style={s.row}>
      <Button label={reveal ? 'Hide key' : 'Show key'} onPress={() => setReveal(!reveal)}><Svg width={18} height={18} viewBox="0 0 24 24"><Path d={reveal ? 'M3 3l18 18M10 10a3 3 0 0 0 4 4M9.9 4.2C10.6 4.1 11.3 4 12 4c7 0 10 8 10 8a18 18 0 0 1-4 5M6.5 6.5C3.5 8.7 2 12 2 12s3 8 10 8c2 0 3.6-.5 5-1.3' : 'M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'} fill="none" stroke={colors.muted} strokeWidth={1.6} /></Svg></Button>
      <View style={s.grow}><Button primary disabled={state.keySaving || state.keyLoading || !!state.storageError || !draft.trim()} onPress={() => void saveKey(draft)}>{state.keySaving ? 'Saving…' : state.key ? 'Update key' : 'Save key'}</Button></View>
      <Button label="Remove locally stored key" disabled={!state.key || state.keySaving || state.keyLoading || !!state.storageError} onPress={() => void saveKey('')}><Svg width={17} height={17} viewBox="0 0 24 24"><Path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" fill="none" stroke={colors.muted} strokeWidth={1.6} /></Svg></Button>
    </View>
    <Text style={s.small}>Stored locally · sent through SHEAR to OpenRouter only for each request.</Text>
    {!!state.key && <View style={s.model}><Text style={s.boldLabel}>OpenRouter model</Text><Text style={s.body}>{state.validation === 'checking' ? 'Verifying key…' : state.validation === 'valid' ? 'GPT-5.6 Luna' : 'Saved on device · needs verification'}</Text>
      {state.validation === 'unverified' && <Button onPress={() => void controller.verify()}>Retry verification</Button>}</View>}
    {state.keyError && <Text accessibilityRole="alert" style={s.error}>{state.keyError}</Text>}
  </View> : state.key ? <View style={s.collapsed}>
    <View style={s.grow}><Text style={s.boldLabel}>OpenRouter key</Text><Text style={s.small}>{state.validation === 'valid' ? 'Saved securely on this device.' : state.validation === 'checking' ? 'Verifying key…' : 'Needs verification.'}</Text></View>
    <Button onPress={openSettings}>Settings</Button>
  </View> : sharedOff ? <View style={s.gate}>
    <Text style={s.gateTitle}>Ask Coach about your training</Text>
    <Text style={s.description}>Coach is not available right now. You can use it with your own OpenRouter key, kept on this device.</Text>
    <View style={s.left}><Button primary onPress={openSettings}>Use your own OpenRouter key</Button></View>
  </View> : null
  const openPrivacy = () => void Linking.openURL('https://getshear.vercel.app/privacy').catch(() => undefined)
  const top = <>
    <View style={s.heading}>
      <Text accessibilityRole="header" style={s.title}>Coach</Text>
      <View style={s.headerActions}>
        <View style={s.tabs}>{(['chat', 'plan'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => { if (value === tab) return; controller.cancel(); setTab(value) }} style={[s.tab, tab === value && s.tabActive]}><Text style={[s.buttonText, tab === value && { color: colors.accentText }]}>{value === 'chat' ? 'Chat' : 'Plan'}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="More Coach options" onPress={() => setMore(true)} style={({ pressed }) => [s.more, pressed && s.pressed]}><Icon name="more" size={20} /></Pressable>
      </View>
    </View>
    {state.keyLoading ? <Text style={s.description}>Loading key settings…</Text> : state.storageError ? <View><Text accessibilityRole="alert" style={s.error}>{state.storageError}</Text><Button onPress={() => void controller.load()}>Retry key loading</Button></View> : !configured && keyPanel}
  </>
  return <SafeAreaView style={s.screen} edges={['top']}><StatusBar style="light" />
    <HistoryHeader />
    <View style={s.grow}>
      <View style={[s.grow, tab !== 'chat' && { display: 'none' }]}>
        {/* The offset keeps the key field above the composer too. */}
        <KeyboardAwareScrollView ref={outer} bottomOffset={80} style={s.grow} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" scrollEventThrottle={16}
          onScroll={event => { navigation.onScroll(event); const e = event.nativeEvent; nearBottom.current = e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y < 96 }}
          onContentSizeChange={() => { if (conversation && nearBottom.current) outer.current?.scrollToEnd({ animated: false }) }}>
          {top}
          {!conversation ? <View style={s.empty}>
            {read ? <View style={s.read}>
              <Text accessibilityRole="header" style={s.readTitle}>{read.title}</Text>
              <Text style={s.readEyebrow}>{read.eyebrow}</Text>
              <Text style={s.body}>{read.body}</Text>
            </View> : <>
              <Text style={s.emptyTitle}>{ready ? 'Ask a question or choose a shortcut.' : 'No conversation history'}</Text>
              <Text style={s.small}>{ready ? 'Ask about your week, next workout, readiness or an exercise plateau.' : 'Your analysis and follow-up questions will appear here.'}</Text>
            </>}
            {!configured && !sharedOff && <Text style={s.note}>Coach sends your question, profile, check-ins, workouts and records to OpenRouter and the AI model provider.{' '}
              <Text accessibilityRole="link" onPress={openPrivacy} style={s.link}>Privacy policy</Text></Text>}
            {ready && <View style={s.prompts}><Text accessibilityRole="header" style={s.nextTitle}>Try asking</Text>{prompts.map(prompt => <Pressable accessibilityRole="button" disabled={!controller.canSend} accessibilityState={{ disabled: !controller.canSend }} key={prompt} onPress={() => send(prompt)} style={[s.prompt, !controller.canSend && s.disabled]}><Text style={s.promptText}>{prompt}</Text><Icon name="chevron-right" /></Pressable>)}</View>}
          </View> : <View style={s.messages}>
            {state.messages.map(message => message.role === 'user'
              ? <View key={message.id} accessible accessibilityLabel={`You: ${message.content}`} style={s.userMessage}><Text selectable style={s.userText}>{message.content}</Text></View>
              : <View key={message.id}><Markdown content={message.content} /><ContextNotice context={message.context} /></View>)}
            {state.generation === 'streaming' && <View>{state.partial ? <Markdown content={state.partial} /> : <Text style={s.description}>Analyzing context…</Text>}<ContextNotice context={state.context} /></View>}
          </View>}
          {['failed', 'interrupted'].includes(state.generation) && <View style={s.feedback}><Text accessibilityRole="alert" style={state.error ? s.error : s.description}>{state.error ?? 'Generation stopped.'}</Text>{!limit && <Button disabled={!controller.canSend} onPress={() => { nearBottom.current = true; controller.retry() }}>Retry AI response</Button>}</View>}
          {configured && keyPanel}
        </KeyboardAwareScrollView>
        {/* The composer stays above the tab bar and rides the keyboard over it. */}
        <KeyboardLift rest={navigationInset}>{ready && <View style={s.composer}>
          <View style={s.composerField}>
            <TextInput accessibilityLabel="Message to AI Coach" selectionColor={colors.selection} multiline maxLength={4000} value={input} onChangeText={setInput} editable={state.generation !== 'streaming' && (configured || !limit)}
              placeholder="Ask about your training" placeholderTextColor={colors.mutedSoft} style={s.composerInput} textAlignVertical="center" />
            <Pressable accessibilityRole="button" accessibilityLabel={state.generation === 'streaming' ? 'Sending' : 'Send'} accessibilityState={{ disabled: !input.trim() || !controller.canSend }} disabled={!input.trim() || !controller.canSend} onPress={() => send(input)}
              style={({ pressed }) => [s.send, !input.trim() || !controller.canSend ? s.sendDisabled : s.sendOn, pressed && s.pressed]}>
              <Icon name="arrow-up" size={18} color={!input.trim() || !controller.canSend ? colors.mutedSoft : colors.onPrimary} />
            </Pressable>
          </View>
          {!!(configured ? 'Responses are billed to your OpenRouter API key.' : allowance) && <Text style={s.composerNote}>{configured ? 'Responses are billed to your OpenRouter API key.' : allowance}</Text>}
        </View>}</KeyboardLift>
      </View>
      <View style={[s.grow, tab !== 'plan' && { display: 'none' }]}><CoachPlanPanel uid={uid} controller={controller} top={top} bottom={configured ? keyPanel : null} onScroll={navigation.onScroll} bottomInset={navigationInset} /></View>
    </View>
    <BottomNavigation {...navigation} />
    {more && <BottomSheet title="Coach" onClose={() => setMore(false)}>{close => <>
      {tab === 'chat' && conversation && <Pressable accessibilityRole="button" onPress={() => close(() => { controller.reset(); nearBottom.current = true })} style={({ pressed }) => [s.sheetRow, pressed && s.pressed]}><Text style={s.sheetRowText}>Reset conversation</Text></Pressable>}
      {!configured && !settings && <Pressable accessibilityRole="button" onPress={() => close(openSettings)} style={({ pressed }) => [s.sheetRow, pressed && s.pressed]}><Text style={s.sheetRowText}>Use your own OpenRouter key</Text></Pressable>}
      <Pressable accessibilityRole="link" onPress={() => close(openPrivacy)} style={({ pressed }) => [s.sheetRow, pressed && s.pressed]}><Text style={s.sheetRowText}>Privacy policy</Text><Icon name="chevron-right" /></Pressable>
    </>}</BottomSheet>}
  </SafeAreaView>
}
const s = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabs: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' }, tab: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 9 }, tabActive: { backgroundColor: colors.choiceSelected },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, pressed: { opacity: 0.6 },
  screen: { flex: 1, backgroundColor: colors.background }, grow: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  title: pageTitle,
  nextTitle: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, marginBottom: 4 },
  read: { gap: 4, paddingBottom: 8 },
  readEyebrow: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  readTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 22, letterSpacing: -0.44, lineHeight: 27 },
  body: { fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 24, color: colors.text },
  description: { fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 24, color: colors.muted },
  small: { fontFamily: 'InstrumentSans_400Regular', fontSize: 12.48, lineHeight: 18.1, color: colors.muted },
  note: { fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19.5, color: colors.muted },
  gate: { paddingVertical: 8, gap: 2 },
  gateTitle: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, lineHeight: 23, color: colors.text },
  left: { alignItems: 'flex-start', marginTop: 7.6 },
  link: { color: colors.text, textDecorationLine: 'underline' },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 }, button: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,0.032)', minHeight: 44, minWidth: 44, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  buttonText: { fontFamily: 'InstrumentSans_700Bold', fontSize: 13, color: colors.muted }, primaryText: { color: colors.onPrimary },
  primary: { borderColor: 'transparent', backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient }, disabled: { opacity: 0.45 },
  empty: { paddingTop: 4, gap: 16 }, emptyTitle: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 20, lineHeight: 26, letterSpacing: -0.32, color: colors.text },
  prompts: {}, prompt: { minHeight: 48, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderColor: colors.line }, promptText: { flex: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 20, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  settings: { backgroundColor: 'rgba(38, 33, 30,0.46)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(244, 238, 232,0.18)', padding: 14.4, gap: 12, marginBottom: 12 },
  settingsTitle: { fontFamily: 'InstrumentSans_700Bold', fontSize: 20, color: colors.textStrong, flexShrink: 1 },
  label: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, color: colors.muted },
  keyInput: { borderWidth: 1, borderColor: colors.line, minHeight: 44, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', color: colors.textStrong, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  boldLabel: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, lineHeight: 24, color: colors.textStrong }, model: { gap: 8, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 },
  collapsed: { paddingVertical: 14.4, marginTop: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(244, 238, 232,0.18)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  messages: { gap: 28 },
  userMessage: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: 14, backgroundColor: colors.surfaceHigh, paddingVertical: 10, paddingHorizontal: 15 },
  userText: { fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21, color: colors.textStrong },
  markdownHeading: { fontFamily: 'InstrumentSans_700Bold', fontSize: 16.8, lineHeight: 24 }, bold: { fontFamily: 'InstrumentSans_700Bold' }, italic: { fontStyle: 'italic' }, code: { fontFamily: 'InstrumentSans_600SemiBold', backgroundColor: 'rgba(255,255,255,0.07)', fontSize: 13 },
  context: { fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 8 },
  feedback: { marginTop: 16, padding: 12, borderWidth: 1, borderColor: colors.line, gap: 8 }, error: { fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20, color: colors.accentText },
  composer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 6, backgroundColor: colors.background },
  composerField: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, borderRadius: 19.2, padding: 4.8, paddingLeft: 16, backgroundColor: colors.surfaceRaised, experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 14px 30px -12px rgba(0, 0, 0, 0.8)' },
  composerInput: { flex: 1, minHeight: 44, maxHeight: 112, paddingVertical: 11, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 20, color: colors.textStrong },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  sendOn: { backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient }, sendDisabled: { backgroundColor: 'rgba(255,255,255,0.06)' },
  composerNote: { paddingHorizontal: 16, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 17, color: colors.muted },
  sheetRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 50 },
  sheetRowText: { color: colors.text, flexShrink: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 15.5 },
})
