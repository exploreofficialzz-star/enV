import { useMemo, useState } from 'react';
import { FieldGrid } from '@/components/engines/fields';
import { Button } from '@/components/ui/button';
import { buildMockupModel, parseMockupToolId } from './mockups-category-engine-utils';

const COLORS: Record<string, { bg: string; accent: string; bubble: string; mine: string; text: string }> = {
  whatsapp: { bg: '#ece5dd', accent: '#075e54', bubble: '#fff', mine: '#dcf8c6', text: '#111' },
  imessage: { bg: '#000', accent: '#1c1c1e', bubble: '#2c2c2e', mine: '#0b84ff', text: '#fff' },
  instagram: { bg: '#050505', accent: '#262626', bubble: '#262626', mine: '#3797f0', text: '#fff' },
  messenger: { bg: '#fff', accent: '#fff', bubble: '#e4e6eb', mine: '#0084ff', text: '#111' },
  telegram: { bg: '#0e1621', accent: '#17212b', bubble: '#182533', mine: '#2b5278', text: '#fff' },
  discord: { bg: '#313338', accent: '#2b2d31', bubble: '#2b2d31', mine: '#5865f2', text: '#fff' },
  snapchat: { bg: '#fffc00', accent: '#fffc00', bubble: '#fff', mine: '#fff', text: '#000' },
  x: { bg: '#000', accent: '#000', bubble: '#202327', mine: '#1d9bf0', text: '#fff' },
  google: { bg: '#fff', accent: '#fff', bubble: '#f2f2f2', mine: '#d3e3fd', text: '#111' },
  sms: { bg: '#f2f2f2', accent: '#f9f9f9', bubble: '#e5e5ea', mine: '#1982fc', text: '#111' },
  signal: { bg: '#1a1a1a', accent: '#121212', bubble: '#3b3b3b', mine: '#2c6bed', text: '#fff' },
  slack: { bg: '#fff', accent: '#350d36', bubble: '#eee', mine: '#1264a3', text: '#111' },
  linkedin: { bg: '#f3f2ef', accent: '#fff', bubble: '#fff', mine: '#0a66c2', text: '#111' },
  reddit: { bg: '#1a1a1b', accent: '#1a1a1b', bubble: '#272729', mine: '#d93a00', text: '#fff' },
  tiktok: { bg: '#000', accent: '#000', bubble: '#1f1f1f', mine: '#fe2c55', text: '#fff' },
  threads: { bg: '#000', accent: '#000', bubble: '#1e1e1e', mine: '#fff', text: '#fff' },
  ai: { bg: '#0e1114', accent: '#171b1e', bubble: '#171b1e', mine: '#0d9f8a', text: '#fff' },
  email: { bg: '#f5f7fa', accent: '#fff', bubble: '#fff', mine: '#dbeafe', text: '#111' },
  gmail: { bg: '#fff', accent: '#fff', bubble: '#f2f2f2', mine: '#dbeafe', text: '#111' },
  outlook: { bg: '#f3f6fb', accent: '#0078d4', bubble: '#fff', mine: '#dbeafe', text: '#111' },
};

function themeFor(platform: string) {
  const key = Object.keys(COLORS).find(k => platform.toLowerCase().includes(k)) || 'email';
  return COLORS[key];
}

export function MockupsCategoryEngine({ toolId }: { toolId: string }) {
  const parsed = useMemo(() => parseMockupToolId(toolId), [toolId]);
  const [values, setValues] = useState({ sender: 'Alex', title: '', messages: 'them: Hey!\nme: This is a fictional mockup.\nthem: Looks good.', platform: '', status: 'Delivered' });
  const model = useMemo(() => buildMockupModel(toolId, values), [toolId, values]);
  const theme = themeFor(model.platform);
  const set = (name: string, value: string) => setValues(v => ({ ...v, [name]: value }));
  const kind = parsed.kind;

  const fields = kind === 'notification'
    ? [{ name: 'sender', label: 'Sender', type: 'text' as const }, { name: 'title', label: 'Notification text', type: 'text' as const }, { name: 'status', label: 'Secondary text', type: 'text' as const }]
    : [{ name: 'sender', label: 'Contact / sender', type: 'text' as const }, { name: 'messages', label: 'Messages (prefix with me: or them:)', type: 'textarea' as const }, { name: 'status', label: 'Status / timestamp', type: 'text' as const }];

  const reset = () => setValues({ sender: 'Alex', title: '', messages: 'them: Hey!\nme: This is a fictional mockup.\nthem: Looks good.', platform: '', status: 'Delivered' });
  const copy = async () => { await navigator.clipboard?.writeText(JSON.stringify(model, null, 2)); };

  return <div className="space-y-5">
    <p className="rounded-md bg-warn/15 px-3 py-2 text-xs text-fg">DEMO / MOCKUP / FICTIONAL — for prototyping, education, storytelling, thumbnails, and design work. Not authentic evidence.</p>
    <FieldGrid fields={fields} values={values} onChange={set} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => window.print()}>Print / Save PDF</Button>
      <Button type="button" variant="outline" onClick={copy}>Copy model</Button>
      <Button type="button" variant="outline" onClick={reset}>Reset</Button>
    </div>
    <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[24px] shadow-[var(--shadow-border)]" style={{ background: theme.bg, color: theme.text }}>
      {kind === 'notification' ? <div className="m-4 rounded-2xl p-4 shadow-lg" style={{ background: theme.bubble }}><p className="text-xs font-semibold opacity-70">{model.platform}</p><p className="mt-1 font-semibold">{values.title || 'New notification'}</p><p className="mt-1 text-sm opacity-75">{values.status || 'Just now'}</p></div> : <>
        <header className="px-4 py-3 text-sm font-semibold" style={{ background: theme.accent }}>{model.sender}<span className="block text-[10px] font-normal opacity-70">{model.platform} · fictional</span></header>
        <div className="min-h-80 space-y-2 p-3">
          {kind === 'typing' && <p className="text-xs opacity-70">{model.sender} is typing…</p>}
          {kind === 'voice' && <div className="rounded-xl p-3" style={{ background: theme.bubble }}><span>▶︎</span> ━━━━━━━ 0:12 <span className="text-xs opacity-70">voice note</span></div>}
          {kind === 'video' && <div className="rounded-xl p-6 text-center" style={{ background: theme.bubble }}>◉<br/><span className="text-xs">Video call · fictional</span></div>}
          {kind !== 'voice' && kind !== 'video' && model.messages.map((m, i) => <div key={i} className={`flex ${m.side === 'me' ? 'justify-end' : 'justify-start'}`}><span className="max-w-[82%] rounded-2xl px-3 py-2 text-sm" style={{ background: m.side === 'me' ? theme.mine : theme.bubble, color: theme.text }}>{m.text}</span></div>)}
          {kind === 'receipt' && <p className="text-right text-[10px] opacity-70">✓✓ {model.status}</p>}
          {kind === 'conversation' && <div className="border-t border-black/10 pt-2 text-center text-[10px] opacity-60">Conversation continues · fictional</div>}
        </div>
      </>}
    </div>
  </div>;
}
