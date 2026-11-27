import { useEffect, useRef, useState } from 'react';
import { ModulePage } from '../features/ModulePage';
import { useGame } from '../persistence/store';
import type { Company, Setup } from '../simulation/types';
import { DEMO_SETUP } from '../simulation/world';
import { CompanySetup } from './CompanySetup';
import { Dashboard, NewsItems } from './Dashboard';
import { gameMonth } from './format';
import { Icon } from './Icon';
import { moduleFromHash, moduleName, navigation, type ModuleId } from './navigation';
import '../styles/app.css';

function BrandSymbol() {
  return <span className="brand-symbol" aria-hidden="true">
    <svg viewBox="0 0 26 26" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 4 22 9l-9 5-9-5 9-5Z M4 13l9 5 9-5 M4 17l9 5 9-5 M13 4v10" />
    </svg>
  </span>;
}

function Sidebar({ module, navigate, open, onClose, company, demo, unsigned }: {
  module: ModuleId;
  navigate: (module: ModuleId) => void;
  open: boolean;
  onClose: () => void;
  company: Company;
  demo: boolean;
  unsigned: number;
}) {
  const navButton = (key: ModuleId) => <button
    key={key} type="button" className="nav-button" aria-current={module === key ? 'page' : undefined}
    aria-label={moduleName(key)} aria-description={key === 'contracts' && unsigned > 0 ? `${unsigned} 份中标合同待签署` : undefined}
    onClick={() => navigate(key)}
  >
    <Icon name={key} size={16} />{moduleName(key)}
    {key === 'contracts' && unsigned > 0 && <span className="nav-count" title={`${unsigned} 份中标合同待签署`}>{unsigned}</span>}
  </button>;

  return <>
    {open && <button type="button" className="sidebar-shade" aria-label="收起导航" onClick={onClose} />}
    <aside id="app-sidebar" className={`app-sidebar${open ? ' app-sidebar--open' : ''}`}>
      <div className="app-brand">
        <BrandSymbol />
        <div><div className="app-brand-title">中国外包时代</div><div className="app-brand-subtitle">GameX · 人力资源企业管理系统</div></div>
      </div>
      <nav className="app-nav" aria-label="主导航">
        {navigation.map(group => <div className="nav-group" key={group.name}>
          <span className="nav-caption">{group.name}</span>
          {group.modules.map(navButton)}
        </div>)}
      </nav>
      <div className="app-sidebar-footer">
        {navButton('settings')}
        <button type="button" className="workspace-button" title="企业与存档设置" onClick={() => navigate('settings')}>
          {company.logo ? <img className="workspace-logo" src={company.logo} alt="" /> : <span className="workspace-logo" aria-hidden="true">{Array.from(company.brand)[0] ?? '企'}</span>}
          <span className="workspace-text"><strong>{company.brand}</strong><small>{company.city} · {demo ? '演示企业' : '当前企业'}</small></span>
          <Icon name="chevronRight" size={13} />
        </button>
      </div>
    </aside>
  </>;
}

type Game = ReturnType<typeof useGame>;

function Header({ module, navigate, game, menuOpen, toggleMenu }: {
  module: ModuleId;
  navigate: (module: ModuleId) => void;
  game: Game;
  menuOpen: boolean;
  toggleMenu: () => void;
}) {
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [readThrough, setReadThrough] = useState('');
  const notices = useRef<HTMLDivElement>(null);
  const latest = game.state.news[0]?.id ?? '';
  const unread = latest !== readThrough;

  useEffect(() => {
    if (!noticesOpen) return;
    const outside = (event: PointerEvent) => {
      if (!notices.current?.contains(event.target as Node)) setNoticesOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNoticesOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [noticesOpen]);

  function openNotifications() {
    setNoticesOpen(value => !value);
    setReadThrough(latest);
  }

  return <header className="app-header">
    <div className="app-header-left">
      <button type="button" className="icon-button mobile-menu" aria-label={menuOpen ? '收起导航' : '展开导航'} aria-expanded={menuOpen} aria-controls="app-sidebar" onClick={toggleMenu}><Icon name="menu" /></button>
      <nav className="app-breadcrumb" aria-label="当前位置">
        <button type="button" onClick={() => navigate('dashboard')}>工作台</button><Icon name="chevronRight" size={12} /><strong>{moduleName(module)}</strong>
      </nav>
    </div>
    <div className="app-header-actions">
      {game.storageError && <button type="button" className="icon-button header-error" aria-label={game.storageError} title={game.storageError} onClick={() => navigate('settings')}><Icon name="alert" size={16} /></button>}
      <span className="header-date"><Icon name="calendar" size={15} />{gameMonth(game.state.month)}</span>
      <span className="header-divider" aria-hidden="true" />
      <button type="button" className="icon-button" title={game.theme === 'dark' ? '切换浅色主题' : '切换深色主题'} aria-label={game.theme === 'dark' ? '切换浅色主题' : '切换深色主题'} onClick={() => game.setTheme(game.theme === 'dark' ? 'light' : 'dark')}>
        <Icon name={game.theme === 'dark' ? 'sun' : 'moon'} size={17} />
      </button>
      <div className="notice-wrap" ref={notices}>
        <button type="button" className="icon-button" aria-label="消息通知" aria-expanded={noticesOpen} aria-controls={noticesOpen ? 'notice-popup' : undefined} title="消息通知" onClick={openNotifications}>
          <Icon name="bell" size={18} />{unread && <i className="notification-dot" />}
        </button>
        {noticesOpen && <section id="notice-popup" className="notice-popup" aria-label="消息通知">
          <header><strong>消息通知</strong><button type="button" className="icon-button" aria-label="关闭消息通知" onClick={() => setNoticesOpen(false)}><Icon name="close" size={15} /></button></header>
          <NewsItems news={game.state.news} limit={5} onSelect={() => { setNoticesOpen(false); navigate('opinion'); }} />
        </section>}
      </div>
      <button type="button" className="header-user" aria-label="企业设置" title="企业设置" onClick={() => navigate('settings')}>经</button>
    </div>
  </header>;
}

interface Toast { message: string; ok: boolean }

function WorkspaceTabs({ tabs, module, navigate, close }: {
  tabs: ModuleId[];
  module: ModuleId;
  navigate: (module: ModuleId) => void;
  close: (module: ModuleId) => void;
}) {
  if (tabs.length < 2) return null;
  return <nav className="app-tabs" aria-label="已打开页面">
    {tabs.map(key => <div className="app-tab" data-active={key === module} key={key}>
      <button type="button" className="app-tab-label" onClick={() => navigate(key)} aria-current={key === module ? 'page' : undefined}>
        <Icon name={key} size={13} />{moduleName(key)}
      </button>
      {key !== 'dashboard' && <button type="button" className="app-tab-close" aria-label={`关闭${moduleName(key)}标签`} onClick={() => close(key)}><Icon name="close" size={11} /></button>}
    </div>)}
  </nav>;
}

export default function App() {
  const game = useGame();
  const [module, setModule] = useState(() => moduleFromHash(window.location.hash));
  const [tabs, setTabs] = useState<ModuleId[]>(() => module === 'dashboard' ? [module] : ['dashboard', module]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const handleHash = () => selectModule(moduleFromHash(window.location.hash));
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    document.title = `${moduleName(module)} · 中国外包时代`;
    window.scrollTo(0, 0);
  }, [module]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function navigate(key: ModuleId) {
    setMenuOpen(false);
    if (key !== moduleFromHash(window.location.hash)) window.location.hash = key;
    selectModule(key);
  }

  function selectModule(key: ModuleId) {
    setModule(key);
    setTabs(current => current.includes(key) ? current : [...current, key]);
  }

  function closeTab(key: ModuleId) {
    if (key === module) navigate(tabs[tabs.indexOf(key) - 1] ?? 'dashboard');
    setTabs(current => current.filter(tab => tab !== key));
  }

  async function advance() {
    const result = await game.dispatch({ type: 'advance' });
    setToast({ message: result.message, ok: result.ok });
  }

  async function create(setup: Setup) {
    await game.newGame(setup);
    setSetupOpen(false);
    navigate('dashboard');
    setToast({ message: `${setup.brand} 已创建。`, ok: true });
  }

  async function loadDemo() {
    await game.loadDemo();
    setSetupOpen(false);
    navigate('dashboard');
    setToast({ message: '已载入演示企业。', ok: true });
  }

  const setUpCompany = () => { if (game.ready) setSetupOpen(true); };
  const state = game.state;
  const unsigned = state.contracts.filter(contract => contract.companyId === state.player.id && contract.status === 'unsigned').length;
  const demo = state.setup.seed === DEMO_SETUP.seed && state.setup.name === DEMO_SETUP.name;

  return <div className="app-frame">
    <a href="#main-content" className="skip-link" onClick={event => {
      event.preventDefault();
      document.getElementById('main-content')?.focus();
    }}>跳到主内容</a>
    <Sidebar module={module} navigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} company={state.player} demo={demo} unsigned={unsigned} />
    <Header module={module} navigate={navigate} game={game} menuOpen={menuOpen} toggleMenu={() => setMenuOpen(value => !value)} />
    <WorkspaceTabs tabs={tabs} module={module} navigate={navigate} close={closeTab} />
    <main id="main-content" className="app-content" tabIndex={-1} aria-busy={!game.ready}>
      {!game.ready ? <div className="app-loading" role="status">正在载入经营数据</div> : module === 'dashboard'
        ? <Dashboard state={state} busy={game.busy} navigate={navigate} advance={() => void advance()} openCompanySetup={setUpCompany} />
        : <ModulePage key={module} module={module} game={game} navigate={navigate} openCompanySetup={setUpCompany} />}
    </main>
    {setupOpen && <CompanySetup city={state.player.city} busy={game.busy} onClose={() => setSetupOpen(false)} onCreate={create} onDemo={loadDemo} />}
    {toast && <div className={`toast${toast.ok ? '' : ' toast--error'}`} role={toast.ok ? 'status' : 'alert'}>
      <Icon name={toast.ok ? 'check' : 'alert'} size={17} /><span>{toast.message}</span>
      <button type="button" className="icon-button" aria-label="关闭提示" onClick={() => setToast(null)}><Icon name="close" size={14} /></button>
    </div>}
  </div>;
}
