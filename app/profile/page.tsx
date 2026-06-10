'use client';
import { useState } from 'react';
import { User, Shield, CreditCard, Bell, Settings, LogOut, Check, ChevronRight, Edit, Upload, Key, Zap, Activity, FlaskConical, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useAngelOneStore } from '@/store/useAngelOneStore';
import { useUIStore } from '@/store/useUIStore';

const SECTIONS = [
  { id:'personal',      label:'Personal Details',   icon:User },
  { id:'kyc',           label:'KYC & Documents',    icon:Shield },
  { id:'bank',          label:'Bank Details',        icon:CreditCard },
  { id:'security',      label:'Security',            icon:Key },
  { id:'notifications', label:'Notifications',       icon:Bell },
  { id:'settings',      label:'App Settings',        icon:Settings },
  { id:'angel-one',     label:'AngelOne API',        icon:Zap },
];

const BLUE = '41,121,255'; const CYAN = '0,212,255';

export default function ProfilePage() {
  const [active, setActive] = useState('personal');

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-4">
      <h1 className="text-lg font-bold mb-4" style={{ color:'var(--text-bright)' }}>Profile</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {/* Sidebar */}
        <div className="md:col-span-1 space-y-3">
          {/* User card */}
          <div className="glass rounded-2xl p-4 text-center" style={{ borderColor:`rgba(${BLUE},0.2)` }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white mx-auto mb-3"
              style={{ background:'linear-gradient(135deg,#2979ff,#aa00ff)' }}>AY</div>
            <div className="text-sm font-bold" style={{ color:'var(--text-bright)' }}>Abhishek Yadav</div>
            <div className="text-[10px] mt-0.5" style={{ color:'var(--text-label)' }}>abhishekdevopstech@gmail.com</div>
            <div className="text-[10px]" style={{ color:'var(--text-label)' }}>Client ID: TK1234567</div>
            <div className="mt-2.5">
              <Badge variant="success" size="sm"><Check size={9} /> KYC Verified</Badge>
            </div>
          </div>

          {/* Nav */}
          <div className="glass rounded-2xl overflow-hidden">
            {SECTIONS.map(sec => {
              const Icon = sec.icon;
              const isActive = active === sec.id;
              return (
                <button key={sec.id} onClick={() => setActive(sec.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors"
                  style={{
                    borderBottom: '1px solid var(--panel-divider)',
                    background: isActive ? `rgba(${CYAN},0.08)` : undefined,
                    color: isActive ? `rgb(${CYAN})` : 'var(--text-dim)',
                  }}>
                  <Icon size={13} />
                  <span className="flex-1 text-left font-medium">{sec.label}</span>
                  <ChevronRight size={11} style={{ color:'#2a3a5a' }} />
                </button>
              );
            })}
            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-red-900/10"
              style={{ color:'var(--accent-red)' }}>
              <LogOut size={13} />
              <span className="flex-1 text-left font-medium">Logout</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="md:col-span-3">
          {active === 'personal'      && <PersonalDetails />}
          {active === 'kyc'           && <KYCDetails />}
          {active === 'bank'          && <BankDetails />}
          {active === 'security'      && <SecurityDetails />}
          {active === 'notifications' && <NotificationSettings />}
          {active === 'settings'      && <AppSettings />}
          {active === 'angel-one'     && <AngelOneApiSection />}
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4" style={{ borderBottom:'1px solid var(--panel-divider)', paddingBottom:'12px' }}>
        <h2 className="text-sm font-bold" style={{ color:'var(--text-bright)' }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--panel-divider)' }}>
      <div className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color:'var(--text-label)' }}>{label}</div>
      <div className="text-xs font-medium" style={{ color:'var(--text-secondary)' }}>{value}</div>
    </div>
  );
}

function Toggle({ enabled }: { enabled: boolean }) {
  const c = enabled ? '41,121,255' : '255,255,255';
  return (
    <div className="w-9 h-5 rounded-full relative cursor-pointer transition-all"
      style={{ background: enabled ? `rgba(${c},0.7)` : 'rgba(255,255,255,0.1)', border:`1px solid rgba(${c},0.4)` }}>
      <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ transform: enabled ? 'translateX(16px)' : 'translateX(1px)' }} />
    </div>
  );
}

function PersonalDetails() {
  return (
    <SectionCard title="Personal Details" action={<Button variant="outline" size="sm"><Edit size={12} /> Edit</Button>}>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          ['Full Name','Abhishek Yadav'],['Email','abhishekdevopstech@gmail.com'],
          ['Mobile','+91 •••• •• 7890'],['PAN','ABCDE1234F'],
          ['Date of Birth','01/01/1990'],['Account Type','Individual'],
        ].map(([l,v]) => <Field key={l} label={l} value={v} />)}
      </div>
      <div className="mt-4 pt-4" style={{ borderTop:'1px solid var(--panel-divider)' }}>
        <h3 className="text-xs font-semibold mb-3" style={{ color:'var(--text-accent)' }}>Segment Activation</h3>
        <div className="flex flex-wrap gap-2">
          {['NSE Equity','BSE Equity','NSE F&O','BSE F&O','Currency','Commodity'].map(seg => {
            const active = ['NSE Equity','BSE Equity','NSE F&O'].includes(seg);
            return (
              <div key={seg} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold"
                style={active
                  ? { background:'rgba(var(--gain-rgb),0.1)', color:'var(--accent-green)', border:'1px solid rgba(var(--gain-rgb),0.25)' }
                  : { background:'rgba(255,255,255,0.04)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
                {active && <Check size={9} />}{seg}
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function KYCDetails() {
  return (
    <SectionCard title="KYC Status" action={<Badge variant="success"><Check size={10} /> Verified</Badge>}>
      <div className="space-y-2">
        {[
          ['Aadhaar Card','12 Mar 2023'],['PAN Card','12 Mar 2023'],
          ['Bank Statement','15 Mar 2023'],['Signature','12 Mar 2023'],
        ].map(([doc,date]) => (
          <div key={doc} className="flex items-center justify-between p-3 rounded-xl"
            style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--panel-divider)' }}>
            <div>
              <div className="text-xs font-semibold" style={{ color:'var(--text-secondary)' }}>{doc}</div>
              <div className="text-[10px]" style={{ color:'var(--text-label)' }}>Uploaded: {date}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success" size="sm"><Check size={9} /> Verified</Badge>
              <Button variant="outline" size="xs"><Upload size={10} /> Re-upload</Button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function BankDetails() {
  return (
    <SectionCard title="Bank Details" action={<Button variant="outline" size="sm">+ Add Bank</Button>}>
      <div className="p-4 rounded-xl" style={{ background:'rgba(41,121,255,0.06)', border:'1px solid rgba(41,121,255,0.2)' }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-bold" style={{ color:'var(--text-bright)' }}>HDFC Bank</div>
            <div className="text-xs mt-1" style={{ color:'var(--text-label)' }}>Account: •••• •••• 4567</div>
            <div className="text-xs" style={{ color:'var(--text-label)' }}>IFSC: HDFC0001234</div>
            <div className="text-xs" style={{ color:'var(--text-label)' }}>Branch: Mumbai - Andheri</div>
          </div>
          <Badge variant="success" size="sm"><Check size={9} /> Primary</Badge>
        </div>
      </div>
    </SectionCard>
  );
}

function SecurityDetails() {
  return (
    <SectionCard title="Security Settings">
      <div className="space-y-3">
        {[
          { label:'2-Factor Authentication', desc:'Secure your account with TOTP or SMS OTP', on:true },
          { label:'Login Alerts',            desc:'Get notified on new device logins',        on:true },
          { label:'Trade Confirmation',      desc:'Require confirmation before placing orders',on:false },
          { label:'Session Timeout',         desc:'Auto logout after 30 minutes of inactivity',on:true },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-white/[0.02]">
            <div>
              <div className="text-xs font-semibold" style={{ color:'var(--text-secondary)' }}>{item.label}</div>
              <div className="text-[10px]" style={{ color:'var(--text-label)' }}>{item.desc}</div>
            </div>
            <Toggle enabled={item.on} />
          </div>
        ))}
        <div className="pt-3 flex gap-2" style={{ borderTop:'1px solid var(--panel-divider)' }}>
          <Button variant="outline" size="sm"><Key size={12} /> Change Password</Button>
          <Button variant="outline" size="sm">Login History</Button>
        </div>
      </div>
    </SectionCard>
  );
}

function NotificationSettings() {
  return (
    <SectionCard title="Notification Preferences">
      <div className="space-y-2">
        {['Order executed','Order rejected','Price alerts triggered','Margin calls','News & announcements','Corporate actions','Account activity'].map(item => (
          <div key={item} className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors hover:bg-white/[0.02]"
            style={{ borderBottom:'1px solid var(--row-border)' }}>
            <span className="text-xs" style={{ color:'var(--text-secondary)' }}>{item}</span>
            <div className="flex gap-3 text-[10px]" style={{ color:'var(--text-label)' }}>
              {['App','Email','SMS'].map(ch => (
                <label key={ch} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" defaultChecked={ch==='App'} className="w-3 h-3 rounded accent-blue-500" />
                  {ch}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function AppSettings() {
  const { theme, setTheme } = useTheme();
  const { fontSize, setFontSize } = useUIStore();
  const [product, setProduct] = useState('CNC');

  const themeLabels: { label: string; value: 'light' | 'dark' | 'system' }[] = [
    { label: 'Light',  value: 'light'  },
    { label: 'Dark',   value: 'dark'   },
    { label: 'System', value: 'system' },
  ];

  const fontSizeOptions: { label: string; value: 'small' | 'normal' | 'large'; desc: string }[] = [
    { label: 'Small',  value: 'small',  desc: '13px' },
    { label: 'Normal', value: 'normal', desc: '14px' },
    { label: 'Large',  value: 'large',  desc: '16px' },
  ];

  return (
    <SectionCard title="App Settings">
      <div className="space-y-5">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color:'var(--text-label)' }}>Theme</label>
          <div className="flex gap-2">
            {themeLabels.map(({ label, value }) => (
              <button key={value} onClick={() => setTheme(value)}
                className="px-4 py-2 text-xs rounded-lg font-semibold transition-all"
                style={theme === value
                  ? { background:`rgba(${CYAN},0.15)`, color:`rgb(${CYAN})`, border:`1px solid rgba(${CYAN},0.35)` }
                  : { background:'rgba(255,255,255,0.04)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color:'var(--text-label)' }}>
            Currently using the {theme} theme
          </p>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color:'var(--text-label)' }}>
            Font Size
          </label>
          <div className="flex gap-2">
            {fontSizeOptions.map(({ label, value, desc }) => (
              <button key={value} onClick={() => setFontSize(value)}
                className="flex flex-col items-center px-4 py-2 rounded-lg font-semibold transition-all"
                style={fontSize === value
                  ? { background:`rgba(${BLUE},0.2)`, color:`rgb(${BLUE})`, border:`1px solid rgba(${BLUE},0.4)` }
                  : { background:'rgba(255,255,255,0.04)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
                <span className="text-xs">{label}</span>
                <span className="text-[10px] opacity-60">{desc}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color:'var(--text-label)' }}>
            Applies to all text across the app — takes effect immediately
          </p>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color:'var(--text-label)' }}>Language</label>
          <select className="h-8 px-3 rounded-lg text-xs outline-none"
            style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--text-secondary)' }}>
            <option style={{ background:'#081020' }}>English</option>
            <option style={{ background:'#081020' }}>Hindi</option>
            <option style={{ background:'#081020' }}>Gujarati</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color:'var(--text-label)' }}>Default Product Type</label>
          <div className="flex gap-2">
            {['MIS','CNC','NRML'].map(t => (
              <button key={t} onClick={() => setProduct(t)}
                className="px-4 py-2 text-xs rounded-lg font-semibold transition-all"
                style={product===t
                  ? { background:`rgba(${BLUE},0.2)`, color:`rgb(${BLUE})`, border:`1px solid rgba(${BLUE},0.4)` }
                  : { background:'rgba(255,255,255,0.04)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function AngelOneApiSection() {
  const { credentials, isConnected, mode, connecting, connectError, lastConnected,
          setCredentials, connect, disconnect, setMode } = useAngelOneStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showTotp, setShowTotp] = useState(false);

  const AMBER = 'rgb(245,158,11)';
  const AMBER_BG = 'rgba(245,158,11,0.1)';
  const AMBER_BORDER = 'rgba(245,158,11,0.28)';

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="glass rounded-2xl p-5" style={{ border: `1px solid ${AMBER_BORDER}` }}>
        <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}` }}>
              <Zap size={16} style={{ color: AMBER }} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-bright)' }}>AngelOne API</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-label)' }}>Connect your AngelOne SmartAPI for live trading</p>
            </div>
          </div>
          {isConnected && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(var(--gain-rgb),0.1)', border: '1px solid rgba(var(--gain-rgb),0.3)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-green)' }} />
              <span className="text-[11px] font-bold" style={{ color: 'var(--accent-green)' }}>CONNECTED</span>
            </div>
          )}
        </div>

        {/* Mode selector */}
        <div className="mb-5">
          <label className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-label)' }}>
            Trading Mode
          </label>
          <div className="flex gap-2">
            <button onClick={() => setMode('paper')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
              style={mode === 'paper'
                ? { background: AMBER_BG, color: AMBER, border: `1px solid ${AMBER_BORDER}` }
                : { background: 'var(--card-inner-bg)', color: 'var(--text-label)', border: '1px solid var(--card-inner-border)' }}>
              <FlaskConical size={13} />
              Paper Trading
              <span className="text-[10px] opacity-70 font-normal">Safe practice</span>
            </button>
            <button onClick={() => isConnected && setMode('live')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
              style={mode === 'live'
                ? { background: 'rgba(var(--gain-rgb),0.15)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.4)' }
                : { background: 'var(--card-inner-bg)', color: 'var(--text-label)', border: '1px solid var(--card-inner-border)', opacity: isConnected ? 1 : 0.5, cursor: isConnected ? 'pointer' : 'not-allowed' }}>
              <Activity size={13} />
              Live Trading
              {!isConnected && <span className="text-[10px] opacity-70 font-normal">Connect API first</span>}
              {mode === 'live' && <span className="text-[10px] font-bold">● ACTIVE</span>}
            </button>
          </div>
          {mode === 'live' && (
            <p className="text-[11px] mt-2 px-2" style={{ color: 'var(--accent-red)' }}>
              ⚠️ Live mode — real money orders will be placed in AngelOne
            </p>
          )}
        </div>

        {/* API Credentials form */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-accent)' }}>API Credentials</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-label)' }}>Client ID</label>
              <input type="text" value={credentials.clientId}
                onChange={e => setCredentials({ clientId: e.target.value })}
                placeholder="e.g. A123456"
                className="w-full h-9 px-3 rounded-lg text-xs font-mono outline-none"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
            </div>
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-label)' }}>API Key</label>
              <input type="text" value={credentials.apiKey}
                onChange={e => setCredentials({ apiKey: e.target.value })}
                placeholder="Your SmartAPI key"
                className="w-full h-9 px-3 rounded-lg text-xs font-mono outline-none"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
            </div>
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-label)' }}>Password / MPIN</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={credentials.clientPassword}
                  onChange={e => setCredentials({ clientPassword: e.target.value })}
                  placeholder="Trading password"
                  className="w-full h-9 px-3 pr-10 rounded-lg text-xs font-mono outline-none"
                  style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
                <button onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium"
                  style={{ color: 'var(--text-label)' }}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-label)' }}>
                TOTP Secret <span style={{ color: 'var(--text-label)', fontWeight: 400 }}>(optional)</span>
              </label>
              <div className="relative">
                <input type={showTotp ? 'text' : 'password'} value={credentials.totpSecret}
                  onChange={e => setCredentials({ totpSecret: e.target.value })}
                  placeholder="Base32 TOTP secret"
                  className="w-full h-9 px-3 pr-10 rounded-lg text-xs font-mono outline-none"
                  style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
                <button onClick={() => setShowTotp(!showTotp)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium"
                  style={{ color: 'var(--text-label)' }}>{showTotp ? 'Hide' : 'Show'}</button>
              </div>
            </div>
          </div>

          {connectError && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(var(--loss-rgb),0.1)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.25)' }}>
              ✗ {connectError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {!isConnected ? (
              <button onClick={connect} disabled={connecting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-60"
                style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}`, color: AMBER }}>
                {connecting ? <><RefreshCw size={12} className="animate-spin" /> Connecting…</> : <><Zap size={12} /> Connect AngelOne</>}
              </button>
            ) : (
              <button onClick={disconnect}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                style={{ background: 'rgba(var(--loss-rgb),0.1)', border: '1px solid rgba(var(--loss-rgb),0.3)', color: 'var(--accent-red)' }}>
                Disconnect
              </button>
            )}
          </div>

          {isConnected && lastConnected && (
            <p className="text-[11px]" style={{ color: 'var(--text-label)' }}>
              ✓ Last connected: {new Date(lastConnected).toLocaleString('en-IN')}
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-5 pt-4 rounded-lg p-3 space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-divider)', borderTop: '1px solid var(--panel-divider)' }}>
          <p className="text-[11px] font-semibold" style={{ color: 'var(--text-accent)' }}>How to get AngelOne API credentials:</p>
          {[
            '1. Login to SmartAPI portal: smartapi.angelbroking.com',
            '2. Create a new app → get your API Key',
            '3. Your Client ID is your AngelOne trading login ID',
            '4. Password is your AngelOne trading account password',
            '5. TOTP Secret: enable app-based 2FA in AngelOne and note the Base32 seed',
          ].map(s => (
            <p key={s} className="text-[11px]" style={{ color: 'var(--text-label)' }}>{s}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
