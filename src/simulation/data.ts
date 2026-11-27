import type { Business, Difficulty, Industry, Occupation, Origin, PageId, Strategy, Technology } from './types'

export const BUSINESS_LABELS: Record<Business, string> = {
  dispatch: '劳务派遣', staffing: '人力外包', delivery: '专业业务外包',
}

export const PAGE_LABELS: Record<PageId, string> = {
  dashboard: '经营总览', market: '市场中心', customers: '客户管理', bidding: '招投标管理',
  contracts: '合同管理', recruitment: '招聘管理', workforce: '人才资源库', staffing: '用工管理',
  suppliers: '供应商管理', payroll: '薪酬社保', training: '培训发展', research: '技术研发',
  labor: '劳动关系', compliance: '合规风控', opinion: '舆情中心', finance: '财务管理',
  rankings: '行业排名', settings: '系统设置',
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '宽裕', standard: '标准', hard: '挑战',
}
export const ORIGIN_LABELS: Record<Origin, string> = {
  bootstrap: '白手起家', dispatch: '传统劳务派遣', software: '互联网外包',
  headhunter: '高端猎头', ai: 'AI 人力科技', regional: '区域服务商',
}
export const STRATEGY_LABELS: Record<Strategy, string> = {
  scale: '低价规模', premium: '高端专业', technology: '技术驱动', channel: '渠道资源',
  steady: '稳健合规', expansion: '激进扩张',
}

export const CITIES = ['上海', '北京', '深圳', '杭州', '广州', '成都', '武汉', '苏州', '重庆'] as const
export const REGION_WAGE: Record<string, number> = { 上海: 1.12, 北京: 1.13, 深圳: 1.10, 杭州: 1.04, 广州: 1, 成都: 0.89, 武汉: 0.88, 苏州: 0.96, 重庆: 0.86 }
export const START_FUNDS: Record<Difficulty, number> = { easy: 3_800_000, standard: 2_500_000, hard: 1_300_000 }

export const ORIGINS: Record<Origin, { reputation: number; compliance: number; tech: number; strategy: Strategy }> = {
  bootstrap: { reputation: 46, compliance: 72, tech: 0, strategy: 'steady' },
  dispatch: { reputation: 53, compliance: 77, tech: 0, strategy: 'scale' },
  software: { reputation: 55, compliance: 74, tech: 1, strategy: 'premium' },
  headhunter: { reputation: 61, compliance: 75, tech: 0, strategy: 'premium' },
  ai: { reputation: 50, compliance: 70, tech: 2, strategy: 'technology' },
  regional: { reputation: 57, compliance: 79, tech: 0, strategy: 'channel' },
}

export const OCCUPATIONS: Occupation[] = [
  { id: 'software', name: '软件开发工程师', wage: 11600, demand: 115, skill: 70 },
  { id: 'ai', name: '算法与数据工程师', wage: 14900, demand: 86, skill: 76 },
  { id: 'support', name: '客户服务专员', wage: 5100, demand: 155, skill: 45 },
  { id: 'warehouse', name: '仓储物流专员', wage: 5400, demand: 140, skill: 47 },
  { id: 'production', name: '生产运营技工', wage: 5900, demand: 150, skill: 50 },
  { id: 'finance', name: '财务运营专员', wage: 8200, demand: 94, skill: 59 },
  { id: 'labeling', name: '质检与数据标注员', wage: 5800, demand: 111, skill: 48 },
  { id: 'maintenance', name: '设备运维工程师', wage: 7900, demand: 100, skill: 62 },
  { id: 'retail', name: '门店运营专员', wage: 4900, demand: 129, skill: 44 },
]

export const INDUSTRIES: Industry[] = [
  { id: 'internet', name: '互联网与软件', growth: 0.028, occupations: ['software', 'support'] },
  { id: 'ev', name: '新能源汽车', growth: 0.038, occupations: ['production', 'maintenance'] },
  { id: 'ai', name: '人工智能', growth: 0.055, occupations: ['ai', 'labeling', 'software'] },
  { id: 'electronics', name: '电子制造', growth: 0.023, occupations: ['production', 'labeling'] },
  { id: 'industry', name: '传统制造', growth: 0.004, occupations: ['maintenance', 'production'] },
  { id: 'finance', name: '金融服务', growth: 0.015, occupations: ['finance', 'software'] },
  { id: 'logistics', name: '电商与物流', growth: 0.031, occupations: ['warehouse', 'support'] },
  { id: 'retail', name: '零售与餐饮', growth: 0.009, occupations: ['retail', 'support'] },
  { id: 'soe', name: '国有企业', growth: 0.010, occupations: ['finance', 'maintenance'] },
  { id: 'public', name: '公共服务', growth: 0.010, occupations: ['support', 'maintenance'] },
]

export const TECHNOLOGIES: Technology[] = [
  { id: 'recruitment', name: '招聘管理系统', detail: '降低招聘流程的单位处理成本。', cost: 72000, months: 2, upkeep: 900 },
  { id: 'screening', name: 'AI 简历筛选', detail: '提升候选人处理效率，筛选偏差会影响部分求职者。', cost: 115000, months: 3, upkeep: 1600 },
  { id: 'matching', name: '智能人才匹配', detail: '提高录用和项目匹配质量。', cost: 138000, months: 3, upkeep: 1800 },
  { id: 'scheduling', name: '智能排班', detail: '缓解缺编带来的工时和疲劳压力。', cost: 98000, months: 2, upkeep: 1100 },
  { id: 'payroll', name: '自动薪酬结算', detail: '降低重复管理支出。', cost: 66000, months: 2, upkeep: 750 },
  { id: 'analytics', name: '人力资源数据分析', detail: '改善需求判断和项目交付预测。', cost: 118000, months: 3, upkeep: 1350 },
  { id: 'assessment', name: '技能评估系统', detail: '提高培训的技能转化效率。', cost: 82000, months: 2, upkeep: 900 },
  { id: 'audit', name: '合规审计系统', detail: '改善风险发现与处置效率。', cost: 105000, months: 3, upkeep: 1150 },
  { id: 'suppliers', name: '智能供应商管理', detail: '减少多层协作带来的交付失真。', cost: 102000, months: 3, upkeep: 1250 },
]

// 这些参数用于游戏内简化规则。费用系数可以随着数值测试单独调整。
export const RULES = {
  statutoryRate: 0.20,
  maxChainDepth: 3,
  maxSubcontract: 0.75,
  monthlyInterest: 0.012,
  dispatchTargetRatio: 0.16,
  standardHours: 174,
  minimumWage: 2500,
  maxWorkersPerAction: 100,
}
