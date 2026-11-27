import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Icon } from '../app/Icon';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'info';
export type Column<T> = {
  title: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  align?: 'right' | 'center';
};

const yuanFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });

export function number(value: number) {
  return yuanFormat.format(value);
}

export function money(value: number) {
  return value < 0 ? `−¥${number(Math.abs(value))}` : `¥${number(value)}`;
}

export function compactMoney(value: number) {
  return Math.abs(value) < 10000 ? money(value) : `${value < 0 ? '−' : ''}¥${(Math.abs(value) / 10000).toFixed(1)}万`;
}

export function percent(value: number) {
  return `${Math.round(value)}%`;
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`feature-tag feature-tag--${tone}`}>{children}</span>;
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="feature-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="feature-actions">{children}</div>}</header>;
}

export function Section({ title, children, action, description }: { title: string; children: ReactNode; action?: ReactNode; description?: string }) {
  return <section className="panel feature-panel"><header className="feature-panel-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>{children}</section>;
}

export function Stats({ items }: { items: { label: string; value: ReactNode; note?: ReactNode; tone?: Tone }[] }) {
  return <div className="feature-stats">{items.map(({ label, value, note, tone }) => <article className="panel feature-metric" key={label}><span>{label}</span><strong className={tone && `feature-ink--${tone}`}>{value}</strong>{note && <small>{note}</small>}</article>)}</div>;
}

export function Button({ children, onClick, primary, disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} className={`button ${primary ? 'button--primary' : 'button--outline'} feature-button`} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function LinkButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="feature-link" disabled={disabled} onClick={onClick}>{children}</button>;
}

export function Empty({ children = '暂无记录' }: { children?: ReactNode }) {
  return <div className="feature-empty"><Icon name="folder" size={24} /><p>{children}</p></div>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: Tone }) {
  return <div className={`feature-notice feature-tag--${tone}`} role="status">{children}</div>;
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <label className="feature-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

export function NumberInput({ value, onChange, min = 0, max, step = 1 }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" required value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={(event) => onChange(event.target.valueAsNumber)} />;
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className="feature-descriptions">{items.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function Meter({ value, label, tone = 'info' }: { value: number; label?: ReactNode; tone?: Tone }) {
  return <div className="feature-meter"><div className="feature-meter-track"><progress max={100} value={Math.min(100, Math.max(0, value))} className={`feature-meter--${tone}`} aria-label="百分比" /></div><span>{label ?? percent(value)}</span></div>;
}

const WINDOW_ROW_HEIGHT = 56;
const WINDOW_HEIGHT = 560;
const WINDOW_PADDING = 3;

type GridProps<T> = {
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  search?: (row: T) => string;
  searchLabel?: string;
  filter?: ReactNode;
  empty?: ReactNode;
  selected?: string[];
  onSelect?: (keys: string[]) => void;
  rowLabel?: (row: T) => string;
  windowed?: boolean;
};

export function Grid<T>({ rows, rowKey, columns, search, searchLabel = '搜索记录', filter, empty, selected, onSelect, rowLabel, windowed }: GridProps<T>) {
  const [query, setQuery] = useState('');
  const [sortIndex, setSortIndex] = useState(-1);
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const visible = useMemo(() => {
    const filterText = query.trim().toLowerCase();
    const matched = search && filterText ? rows.filter((row) => search(row).toLowerCase().includes(filterText)) : rows;
    const sorter = columns[sortIndex]?.sort;
    if (!sorter) return matched;
    return [...matched].sort((left, right) => {
      const a = sorter(left);
      const b = sorter(right);
      const order = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'zh-CN');
      return order * (ascending ? 1 : -1);
    });
  }, [rows, query, search, columns, sortIndex, ascending]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages - 1);
  const subset = visible.slice(current * pageSize, (current + 1) * pageSize);
  const pageKeys = subset.map(rowKey);
  const allChecked = pageKeys.length > 0 && pageKeys.every((key) => selected?.includes(key));
  const selectable = Boolean(selected && onSelect);

  function togglePage(checked: boolean) {
    if (!selected || !onSelect) return;
    onSelect(checked ? [...new Set([...selected, ...pageKeys])] : selected.filter((key) => !pageKeys.includes(key)));
  }

  const headers = <tr>
    {selectable && <th className="feature-select-col" scope="col"><input type="checkbox" aria-label="选择当前页全部记录" checked={allChecked} onChange={(event) => togglePage(event.target.checked)} /></th>}
    {columns.map((column, index) => <th key={column.title} scope="col" className={column.align ? `feature-align-${column.align}` : undefined} aria-sort={sortIndex === index ? (ascending ? 'ascending' : 'descending') : undefined}>
      {column.sort ? <button type="button" onClick={() => { setAscending(sortIndex === index ? !ascending : true); setSortIndex(index); setPage(0); }}>{column.title} <span aria-hidden="true">{sortIndex === index ? (ascending ? '↑' : '↓') : '↕'}</span></button> : column.title}
    </th>)}
  </tr>;

  return <div className="feature-grid">
    {(search || filter) && <div className="feature-grid-tools">
      {search && <div className="feature-search"><Icon name="search" size={14} /><input type="search" aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></div>}
      {filter}
    </div>}
    <GridViewport key={`${current}-${pageSize}-${query}-${sortIndex}-${ascending}`} rows={subset} windowed={Boolean(windowed) && subset.length > 25} headers={headers} columnCount={columns.length + Number(selectable)} empty={empty} renderRow={(row) => {
      const key = rowKey(row);
      return <tr key={key}>
        {selected && onSelect && <td><input type="checkbox" aria-label={`选择${rowLabel?.(row) ?? key}`} checked={selected.includes(key)} onChange={(event) => onSelect(event.target.checked ? [...selected, key] : selected.filter((item) => item !== key))} /></td>}
        {columns.map((column) => <td key={column.title} className={column.align ? `feature-align-${column.align}` : undefined}>{column.render(row)}</td>)}
      </tr>;
    }} />
    <footer className="feature-grid-footer">
      <span>共 {number(visible.length)} 条{selected && selected.length > 0 ? ` · 已选 ${number(selected.length)} 条` : ''}</span>
      <div>
        <label>每页 <select aria-label="每页条数" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}><option>10</option><option>20</option><option>50</option></select></label>
        <button type="button" aria-label="上一页" disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button>
        <span>{current + 1} / {pages}</span>
        <button type="button" aria-label="下一页" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>›</button>
      </div>
    </footer>
  </div>;
}

function GridViewport<T>({ rows, headers, columnCount, empty, renderRow, windowed }: { rows: T[]; headers: ReactNode; columnCount: number; empty?: ReactNode; renderRow: (row: T) => ReactNode; windowed: boolean }) {
  const [scrollTop, setScrollTop] = useState(0);
  const lastVisible = Math.min(rows.length - 1, Math.floor(scrollTop / WINDOW_ROW_HEIGHT));
  const start = windowed ? Math.max(0, lastVisible - WINDOW_PADDING) : 0;
  const end = windowed ? Math.min(rows.length, lastVisible + Math.ceil(WINDOW_HEIGHT / WINDOW_ROW_HEIGHT) + WINDOW_PADDING) : rows.length;
  return <div className={`feature-grid-scroll${windowed ? ' feature-grid-scroll--windowed' : ''}`} onScroll={windowed ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined} tabIndex={windowed ? 0 : undefined} aria-label={windowed ? '人员列表，滚动显示更多记录' : undefined}>
    <table><thead>{headers}</thead><tbody>
      {start > 0 && <tr className="feature-grid-spacer" aria-hidden="true"><td colSpan={columnCount} style={{ height: start * WINDOW_ROW_HEIGHT }} /></tr>}
      {rows.slice(start, end).map(renderRow)}
      {end < rows.length && <tr className="feature-grid-spacer" aria-hidden="true"><td colSpan={columnCount} style={{ height: (rows.length - end) * WINDOW_ROW_HEIGHT }} /></tr>}
    </tbody></table>
    {rows.length === 0 && <Empty>{empty}</Empty>}
  </div>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  function handleKeys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"], a[href]')).filter((item) => item.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return <div className="feature-modal-backdrop" onClick={onClose}>
    <section className="panel feature-modal" role="dialog" aria-modal="true" aria-label={title} ref={dialog} onClick={(event) => event.stopPropagation()} onKeyDown={handleKeys}>
      <header className="feature-panel-header"><h2>{title}</h2><button className="feature-close" type="button" onClick={onClose} aria-label="关闭" ref={closeButton}><Icon name="close" size={16} /></button></header>
      <div className="feature-modal-body">{children}</div>
    </section>
  </div>;
}
