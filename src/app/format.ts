const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });

export function integer(value: number) {
  return number.format(value);
}

export function currency(value: number) {
  return `${value < 0 ? '−' : ''}¥${integer(Math.abs(value))}`;
}

export function compactMoney(value: number, digits = 1) {
  const amount = Math.abs(value);
  if (amount < 10_000) return currency(value);
  const unit = amount < 100_000_000 ? 10_000 : 100_000_000;
  return `${value < 0 ? '−' : ''}¥${(amount / unit).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit === 10_000 ? '万' : '亿'}`;
}

export function percent(value: number, precision = 0) {
  return `${value.toFixed(precision)}%`;
}

export function gameMonth(month: number) {
  return `${2026 + Math.floor(month / 12)}年${month % 12 + 1}月`;
}

export function shortMonth(month: number) {
  return `${month % 12 + 1}月`;
}
