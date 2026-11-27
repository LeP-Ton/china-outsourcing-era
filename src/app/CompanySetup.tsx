import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { CITIES, DIFFICULTY_LABELS, ORIGIN_LABELS, START_FUNDS } from '../simulation/data';
import type { Difficulty, Origin, Setup } from '../simulation/types';
import { compactMoney } from './format';
import { Icon } from './Icon';

function randomSeed() {
  const values = globalThis.crypto.getRandomValues(new Uint32Array(1));
  return `GX-${values[0]?.toString(36).toUpperCase().padStart(7, '0')}`;
}

export function CompanySetup({ city, busy, onClose, onCreate, onDemo }: {
  city: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (setup: Setup) => Promise<void>;
  onDemo: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const logoUpload = useRef(0);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [logo, setLogo] = useState<string>();
  const [base, setBase] = useState(city);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [origin, setOrigin] = useState<Origin>('bootstrap');
  const [seed, setSeed] = useState(randomSeed);
  const [challenge, setChallenge] = useState<Setup['challenge']>();
  const [error, setError] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  function selectLogo(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const token = ++logoUpload.current;
    const file = input.files?.[0];
    setError('');
    setLogo(undefined);
    setLogoBusy(false);
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 1_500_000) {
      input.value = '';
      setError('标识文件须为不超过 1.5 MB 的 PNG、JPG、WebP 或 GIF。');
      return;
    }
    setLogoBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (token !== logoUpload.current) return;
      if (typeof reader.result === 'string') setLogo(reader.result);
      setLogoBusy(false);
    };
    reader.onerror = () => {
      if (token !== logoUpload.current) return;
      input.value = '';
      setLogoBusy(false);
      setError('无法读取标识文件。');
    };
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = { name: name.trim(), brand: brand.trim(), seed: seed.trim() };
    if (!clean.name || !clean.brand || !clean.seed) {
      setError('请填写企业名称、品牌名称和世界种子。');
      return;
    }
    setError('');
    try {
      await onCreate({ ...clean, logo, city: base, difficulty, origin, challenge });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建企业失败。');
    }
  }

  async function loadDemo() {
    setError('');
    try {
      await onDemo();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '演示企业读取失败。');
    }
  }

  return <dialog ref={dialog} className="company-dialog" aria-labelledby="company-dialog-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <form onSubmit={submit}>
      <header className="dialog-header">
        <div><h2 id="company-dialog-title">创建企业</h2><p>选定开局条件，从 2026 年 1 月开始经营。</p></div>
        <button type="button" aria-label="关闭" className="icon-button" disabled={busy} onClick={onClose}><Icon name="close" /></button>
      </header>
      <div className="dialog-fields">
        <label className="dialog-field">企业名称
          <input autoFocus required maxLength={48} placeholder="汇源人力资源服务有限公司" value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label className="dialog-field">品牌名称
          <input required maxLength={16} placeholder="汇源人力" value={brand} onChange={event => setBrand(event.target.value)} />
        </label>
        <label className="dialog-field">经营地区
          <select value={base} onChange={event => setBase(event.target.value)}>{CITIES.map(option => <option key={option}>{option}</option>)}</select>
        </label>
        <label className="dialog-field">初始资金难度
          <select value={difficulty} onChange={event => setDifficulty(event.target.value as Difficulty)}>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label} · {compactMoney(START_FUNDS[value as Difficulty], 0)}</option>)}
          </select>
        </label>
        <label className="dialog-field">企业背景
          <select value={origin} onChange={event => setOrigin(event.target.value as Origin)}>
            {Object.entries(ORIGIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="dialog-field">经营模式
          <select value={challenge ?? ''} onChange={event => setChallenge(event.target.value ? Number(event.target.value) as Setup['challenge'] : undefined)}>
            <option value="">开放式沙盒</option><option value="5">5 年挑战</option><option value="10">10 年挑战</option><option value="20">20 年挑战</option>
          </select>
        </label>
        <div className="dialog-field"><label htmlFor="setup-seed">世界种子</label>
          <span className="dialog-seed"><input id="setup-seed" required maxLength={80} value={seed} aria-describedby="setup-seed-description" onChange={event => setSeed(event.target.value)} />
            <button type="button" className="icon-button" title="随机生成种子" aria-label="随机生成种子" onClick={() => setSeed(randomSeed())}><Icon name="refresh" size={15} /></button></span>
          <small id="setup-seed-description">相同种子和开局条件可生成相同的初始市场。</small>
        </div>
        <label className="dialog-field">企业标识（可选）
          <span className="dialog-file">{logo && <img src={logo} alt="企业标识预览" />}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={selectLogo} /></span>
          <small>PNG、JPG、WebP 或 GIF，最多 1.5 MB。</small>
        </label>
      </div>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <div className="dialog-notice"><Icon name="information" size={14} />创建企业或载入演示将替换当前自动存档。</div>
      <footer className="dialog-footer">
        <button type="button" className="button button--text" disabled={busy} onClick={() => void loadDemo()}>载入演示企业</button>
        <div><button type="button" className="button button--outline" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="button button--primary" disabled={busy || logoBusy}>创建并开始</button></div>
      </footer>
    </form>
  </dialog>;
}
