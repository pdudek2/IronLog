import CoachPlanPanel from '../src/CoachPlanPanel'
import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
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
import { Icon } from '../src/icons'

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
  const scroll = useRef<ScrollView>(null)
  const outer = useRef<ScrollView>(null)
  const composerY = useRef(0)
  const chatY = useRef(0)
  const composerFocused = useRef(false)
  const { height } = useWindowDimensions()
  const nearBottom = useRef(true)
  const conversation = state.messages.length > 0
  const configured = !!state.key && state.validation !== 'invalid'
  useEffect(() => { void controller.load(); return () => controller.dispose() }, [controller])
  useEffect(() => { const subscription = Keyboard.addListener('keyboardDidShow', () => { if (composerFocused.current) outer.current?.scrollTo({ y: Math.max(0, composerY.current - 80), animated: true }) }); return () => subscription.remove() }, [])
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
    <TextInput accessibilityLabel="Your OpenRouter key" value={draft} onChangeText={setDraft} secureTextEntry={!reveal} selectionColor={colors.accentText}
      editable={!state.keyLoading && !state.keySaving && !state.storageError} autoCorrect={false} autoCapitalize="none" autoComplete="off" maxLength={4096}
      placeholder="Paste OpenRouter API key" placeholderTextColor={colors.mutedSoft} style={s.keyInput} />
    <View style={s.row}>
      <Button label={reveal ? 'Hide key' : 'Show key'} onPress={() => setReveal(!reveal)}><Svg width={18} height={18} viewBox="0 0 24 24"><Path d={reveal ? 'M3 3l18 18M10 10a3 3 0 0 0 4 4M9.9 4.2C10.6 4.1 11.3 4 12 4c7 0 10 8 10 8a18 18 0 0 1-4 5M6.5 6.5C3.5 8.7 2 12 2 12s3 8 10 8c2 0 3.6-.5 5-1.3' : 'M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'} fill="none" stroke={colors.muted} strokeWidth={1.6} /></Svg></Button>
      <View style={s.grow}><Button primary disabled={state.keySaving || state.keyLoading || !!state.storageError || !draft.trim()} onPress={() => void saveKey(draft)}>{state.keySaving ? 'Saving…' : state.key ? 'Update key' : 'Save key'}</Button></View>
      <Button label="Remove locally stored key" disabled={!state.key || state.keySaving || state.keyLoading || !!state.storageError} onPress={() => void saveKey('')}><Svg width={17} height={17} viewBox="0 0 24 24"><Path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" fill="none" stroke={colors.muted} strokeWidth={1.6} /></Svg></Button>
    </View>
    <Text style={s.small}>Stored locally · sent through SHEAR to OpenRouter only for each request.</Text>
    {!!state.key && <View style={s.model}><Text style={s.boldLabel}>OpenRouter model</Text><Text style={s.body}>{state.validation === 'checking' ? 'Verifying key…' : state.validation === 'valid' ? 'GPT-5.6 Luna · Max reasoning' : 'Saved on device · needs verification'}</Text>
      {state.validation === 'unverified' && <Button onPress={() => void controller.verify()}>Retry verification</Button>}</View>}
    {state.keyError && <Text accessibilityRole="alert" style={s.error}>{state.keyError}</Text>}
  </View> : state.key ? <View style={s.collapsed}>
    <View style={s.grow}><Text style={s.boldLabel}>OpenRouter key</Text><Text style={s.small}>{state.validation === 'valid' ? 'Saved securely on this device.' : state.validation === 'checking' ? 'Verifying key…' : 'Needs verification.'}</Text></View>
    <Button onPress={openSettings}>Settings</Button>
  </View> : <View style={s.gate}>
    <Text style={s.gateTitle}>Ask Coach about your training</Text><Text style={s.description}>Coach reads your workouts to answer questions and draft plans. It is optional and runs on your own OpenRouter key, kept on this device.</Text>
    <View style={s.left}><Button primary onPress={openSettings}>Set up key</Button></View>
  </View>
  return <SafeAreaView onFocus={navigation.onFocus} onBlur={navigation.onBlur} style={s.screen} edges={['top']}><StatusBar style="light" />
    <HistoryHeader />
    <KeyboardAvoidingView style={s.grow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.workspace}>
        <ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} ref={outer} style={s.grow} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.heading}><Text accessibilityRole="header" style={s.title}>Coach</Text></View>
          <View style={s.tabs}>{(['chat', 'plan'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => { if (value === tab) return; controller.cancel(); setTab(value) }} style={[s.tab, tab === value && s.tabActive]}><Text style={[s.buttonText, tab === value && { color: colors.accentText }]}>{value === 'chat' ? 'Chat' : 'Plan'}</Text></Pressable>)}</View>
          {state.keyLoading ? <Text style={s.description}>Loading key settings…</Text> : state.storageError ? <View><Text accessibilityRole="alert" style={s.error}>{state.storageError}</Text><Button onPress={() => void controller.load()}>Retry key loading</Button></View> : !configured && keyPanel}
          {read && tab === 'chat' && !conversation && <View style={[s.read, !configured && s.readAfterGate]}>
            <Text accessibilityRole="header" style={s.readTitle}>{read.title}</Text>
            <Text style={s.readEyebrow}>{read.eyebrow}</Text>
            <Text style={s.body}>{read.body}</Text>
          </View>}
          <View style={tab !== 'chat' && { display: 'none' }}><View onLayout={event => { chatY.current = event.nativeEvent.layout.y }} style={[s.chat, conversation && { height: Math.max(336, height - 336) }]}>
          {conversation && <View style={s.toolbar}><Button onPress={() => { controller.reset(); nearBottom.current = true }} label="Reset conversation">Reset</Button></View>}
          {!conversation ? <View style={[s.empty, configured && { paddingTop: 0 }]}>
            {!read && <Text style={s.emptyTitle}>{configured ? 'Ask a question or choose a shortcut.' : 'No conversation history'}</Text>}
            {!read && <Text style={s.small}>{configured ? 'Ask about your week, next workout, readiness or an exercise plateau.' : 'Your analysis and follow-up questions will appear here.'}</Text>}
            {configured && <View style={s.prompts}><Text accessibilityRole="header" style={s.nextTitle}>Next</Text>{prompts.map(prompt => <Pressable accessibilityRole="button" disabled={!controller.canSend} accessibilityState={{ disabled: !controller.canSend }} key={prompt} onPress={() => send(prompt)} style={[s.prompt, !controller.canSend && s.disabled]}><Text style={s.promptText}>{prompt}</Text><Icon name="chevron-right" size={16} /></Pressable>)}</View>}
          </View> : <ScrollView ref={scroll} style={s.grow} nestedScrollEnabled contentContainerStyle={s.messages} keyboardShouldPersistTaps="handled"
            onScroll={({ nativeEvent: e }) => { nearBottom.current = e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y < 96 }} scrollEventThrottle={32}
            onContentSizeChange={() => { if (nearBottom.current) scroll.current?.scrollToEnd({ animated: false }) }}>
            {state.messages.map(message => <View key={message.id} style={[s.message, message.role === 'user' && s.userMessage]}>
              <Text style={[s.role, message.role === 'user' && s.userRole]}>{message.role === 'user' ? 'YOU' : 'AI COACH'}</Text><Markdown content={message.content} /><ContextNotice context={message.context} />
            </View>)}
            {state.generation === 'streaming' && <View style={s.message}><Text style={s.role}>AI COACH</Text>{state.partial ? <Markdown content={state.partial} /> : <Text style={s.description}>Analyzing context…</Text>}<ContextNotice context={state.context} /></View>}
          </ScrollView>}
          {['failed', 'interrupted'].includes(state.generation) && <View style={s.feedback}><Text accessibilityRole="alert" style={state.error ? s.error : s.description}>{state.error ?? 'Generation stopped.'}</Text><Button disabled={!controller.canSend} onPress={() => { nearBottom.current = true; controller.retry() }}>Retry AI response</Button></View>}
          {configured && <View style={s.composer} onLayout={event => { composerY.current = event.nativeEvent.layout.y + chatY.current }}>
            <TextInput accessibilityLabel="Message to AI Coach" selectionColor={colors.accentText} multiline maxLength={4000} value={input} onChangeText={setInput} editable={state.generation !== 'streaming'}
              onFocus={() => { composerFocused.current = true }} onBlur={() => { composerFocused.current = false }}
              placeholder="Ask about progress or your last session" placeholderTextColor={colors.mutedSoft} style={s.composerInput} textAlignVertical="top" />
            <View style={s.sendRow}><Button primary disabled={!input.trim() || !controller.canSend} onPress={() => send(input)}>{state.generation === 'streaming' ? 'Sending…' : 'Send'}</Button></View>
          </View>}
          </View>
          </View><View style={tab !== 'plan' && { display: 'none' }}><CoachPlanPanel uid={uid} controller={controller} /></View>
          {configured && keyPanel}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  <BottomNavigation {...navigation} />
  </SafeAreaView>
}
const s = StyleSheet.create({
  tabs: { flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', marginBottom: 14 }, tab: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 9 }, tabActive: { backgroundColor: colors.choiceSelected },
  screen: { flex: 1, backgroundColor: colors.background }, grow: { flex: 1 },
  workspace: { flex: 1 },
  
  content: { padding: 16, paddingBottom: 20 }, heading: { paddingTop: 0, paddingBottom: 0, gap: 6, marginBottom: 14 },
  title: pageTitle,
  nextTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  read: { gap: 4, paddingBottom: 18, paddingTop: 4 }, readAfterGate: { paddingTop: 24 },
  readEyebrow: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  readTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 22, letterSpacing: -0.44, lineHeight: 27 },
  subtitle: { fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21, color: colors.muted },
  body: { fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 24, color: colors.text },
  description: { fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 24, color: colors.muted },
  small: { fontFamily: 'InstrumentSans_400Regular', fontSize: 12.48, lineHeight: 18.1, color: colors.muted },
  gate: { paddingVertical: 8, gap: 2 },
  gateTitle: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, lineHeight: 23, color: colors.text },
  left: { alignItems: 'flex-start', marginTop: 7.6 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 }, button: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,0.032)', minHeight: 44, minWidth: 44, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  buttonText: { fontFamily: 'InstrumentSans_700Bold', fontSize: 13, color: colors.muted }, primaryText: { color: colors.onPrimary },
  primary: { borderColor: 'transparent', backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient }, disabled: { opacity: 0.45 },
  empty: { paddingTop: 16, paddingBottom: 0, gap: 8 }, emptyTitle: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 20, lineHeight: 26, letterSpacing: -0.32, color: colors.text },
  prompts: { gap: 2 }, prompt: { minHeight: 48, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, promptText: { flex: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 20, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  settings: { backgroundColor: 'rgba(38, 33, 30,0.46)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(244, 238, 232,0.18)', padding: 14.4, gap: 12 },
  settingsTitle: { fontFamily: 'InstrumentSans_700Bold', fontSize: 20, color: colors.textStrong, flexShrink: 1 },
  label: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, color: colors.muted },
  keyInput: { borderWidth: 1, borderColor: colors.line, minHeight: 44, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', color: colors.textStrong, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  boldLabel: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, lineHeight: 24, color: colors.textStrong }, model: { gap: 8, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 },
  collapsed: { paddingVertical: 14.4, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(244, 238, 232,0.18)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  chat: { paddingVertical: 12.8, marginTop: 0, marginBottom: 16 }, toolbar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  messages: { gap: 12.8 }, message: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,0.032)', paddingVertical: 14.4, paddingHorizontal: 16, borderRadius: 0 },
  userMessage: { alignSelf: 'flex-end', maxWidth: '100%', borderColor: 'rgba(244, 238, 232, 0.156)', experimental_backgroundImage: 'linear-gradient(135deg,rgba(244, 238, 232, 0.09),rgba(244, 238, 232, 0.036))' },
  role: { fontFamily: 'InstrumentSans_700Bold', fontSize: 11, lineHeight: 16.3, letterSpacing: 0.87, color: colors.muted, marginBottom: 5.6 }, userRole: { color: colors.accentText },
  markdownHeading: { fontFamily: 'InstrumentSans_700Bold', fontSize: 16.8, lineHeight: 24 }, bold: { fontFamily: 'InstrumentSans_700Bold' }, italic: { fontStyle: 'italic' }, code: { fontFamily: 'InstrumentSans_600SemiBold', backgroundColor: 'rgba(255,255,255,0.07)', fontSize: 13 },
  context: { fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 8 },
  feedback: { marginTop: 16, padding: 12, borderWidth: 1, borderColor: colors.line, gap: 8 }, error: { fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20, color: colors.accentText },
  composer: { paddingTop: 11.2, gap: 9.6 },
  composerInput: { minHeight: 50, maxHeight: 112, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.surfaceRaised, experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07)', fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 20, color: colors.textStrong }, sendRow: { alignItems: 'flex-end' },
})
