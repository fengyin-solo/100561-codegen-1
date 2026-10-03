import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  CoalAssayInput,
  CoalRegisterInput,
  CoalSettleInput,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 燃料煤台账：化验批次落本模块，化验结论落到热费结算的待核清单。
const COAL_KEY = 'coallab'
const HEATBILLING_KEY = 'heatbilling'
const COAL_BILLING_PREFIX = 'COAL-'

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

function fail(message: string): ActionResult {
  return { ok: false, message }
}

function todayText(): string {
  return new Date().toISOString().slice(0, 10)
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

// 进场车数必须是正整数：空、0、负数、小数、非数字都按无效值挡回。
function parsePositiveInteger(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) {
    return null
  }
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

// 低位发热量沿用既有化验口径：收到基低位发热量（Qnet,ar，MJ/kg），须为正数，按现有可测上限挡无效值。
function parseCalorificValue(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return null
  }
  const value = Number(text)
  return Number.isFinite(value) && value > 0 && value <= 40 ? Number(value.toFixed(2)) : null
}

function findCoalBatch(rows: EntryRow[], batch: string): EntryRow | undefined {
  return rows.find((row) => String(row['化验批次'] ?? '') === batch.trim())
}

// 建议下一个化验批次号：MY-年月-三位序号。
export function suggestCoalBatch(): string {
  const rows = listRows(COAL_KEY)
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const prefix = `MY-${ym}-`
  const seq = rows
    .map((row) => String(row['化验批次'] ?? ''))
    .filter((batch) => batch.startsWith(prefix))
    .map((batch) => Number(batch.slice(prefix.length)))
    .reduce((max, value) => (Number.isSafeInteger(value) ? Math.max(max, value) : max), 0)
  return `${prefix}${String(seq + 1).padStart(3, '0')}`
}

// 第一段：过磅登记。计量以过磅单为准，供煤单位空着不许落账，车数无效挡回。
export function registerCoalEntry(input: CoalRegisterInput): ActionResult {
  const batch = input.化验批次.trim()
  const supplier = input.供煤单位.trim()
  const weighSlip = input.过磅单号.trim()
  const weighDate = input.过磅日期.trim() || todayText()

  if (!batch) {
    return fail('化验批次号不能为空')
  }
  if (!supplier) {
    return fail('供煤单位空着的不许落账，请先补齐供煤单位')
  }
  if (!weighSlip) {
    return fail('过磅单号不能为空，计量以过磅单为准')
  }
  const weighTrucks = parsePositiveInteger(input.过磅车数)
  if (weighTrucks === null) {
    return fail('过磅车数为无效值：必须是大于 0 的整数车数')
  }
  const entryTrucks = parsePositiveInteger(input.进场车数)
  if (entryTrucks === null) {
    return fail('进场车数为无效值：必须是大于 0 的整数车数')
  }
  // 过磅单是唯一计量依据：过磅车数与进厂点登记的进场车数两处读到的必须一致。
  if (weighTrucks !== entryTrucks) {
    return fail(`进场车数（${entryTrucks} 车）与过磅单车数（${weighTrucks} 车）不一致，先核对过磅单`)
  }

  const rows = listRows(COAL_KEY)
  if (findCoalBatch(rows, batch)) {
    return fail(`化验批次 ${batch} 已经立账，重复过磅登记已挡回`)
  }
  if (rows.some((row) => String(row['过磅单号'] ?? '') === weighSlip)) {
    return fail(`过磅单 ${weighSlip} 已登记过，不能重复落账`)
  }

  const row: EntryRow = {
    id: nextId(rows),
    status: '待化验',
    pending: true,
    abnormal: false,
    化验批次: batch,
    供煤单位: supplier,
    过磅单号: weighSlip,
    过磅车数: weighTrucks,
    进场车数: entryTrucks,
    过磅日期: weighDate,
    化验日期: '',
    低位发热量: '',
    结算单号: '',
    结算日期: '',
  }
  saveRows(COAL_KEY, [...rows, row])
  return { ok: true, message: `批次 ${batch} 已按过磅单落账，当前「待化验」，等化验室出结果` }
}

// 把化验结论推进热费结算的待核清单：同一批次只留一条。
function pushCoalToHeatBilling(row: EntryRow): void {
  const billingRows = listRows(HEATBILLING_KEY)
  const batch = String(row['化验批次'])
  const billNo = `${COAL_BILLING_PREFIX}${batch}`
  const heatRow: EntryRow = {
    id: nextId(billingRows),
    status: '待核算',
    pending: true,
    abnormal: false,
    结算编号: billNo,
    用户名称: `${row['供煤单位']}（入场燃煤·${batch}）`,
    用热面积: '',
    热价标准: `煤款待核 · 收到基低位发热量 ${row['低位发热量']} MJ/kg`,
    应缴金额: 0,
    缴费日期: '',
    收费员: '',
    结算状态: '待核算',
  }
  saveRows(HEATBILLING_KEY, [...billingRows, heatRow])
}

// 第二段：出具化验单。化验先出、结算随后补录；重复提交同一批次化验单只留一条。
export function issueCoalAssay(batchId: number, input: CoalAssayInput): ActionResult {
  const rows = listRows(COAL_KEY)
  const index = rows.findIndex((row) => Number(row.id) === batchId)
  if (index < 0) {
    return fail(`没有找到编号为 ${batchId} 的化验批次`)
  }
  const current = rows[index]
  if (current.status === '已化验' || current.status === '已结算') {
    return fail(`批次 ${current['化验批次']} 的化验单已出具，重复提交只保留一条，不再入账`)
  }

  const labTrucks = parsePositiveInteger(input.化验单车数)
  if (labTrucks === null) {
    return fail('化验单上的进场车数为无效值：必须是大于 0 的整数车数')
  }
  // 化验室与过磅单两处读到的进场车数要一致，沿用既有化验口径，不允许以化验单改计量。
  if (labTrucks !== Number(current['进场车数'])) {
    return fail(`化验单进场车数（${labTrucks} 车）与过磅登记（${current['进场车数']} 车）不一致，化验单退回核对`)
  }

  const calorific = parseCalorificValue(input.低位发热量)
  if (calorific === null) {
    return fail('低位发热量为无效值：须按收到基低位发热量（MJ/kg）填写正数')
  }

  const assayDate = input.化验日期.trim() || todayText()
  const updated: EntryRow = {
    ...current,
    status: '已化验',
    pending: true,
    化验日期: assayDate,
    低位发热量: calorific,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(COAL_KEY, next)

  // 化验结论落到热费结算的待核清单（已存在同批次待核条目的，不重复建）。
  const billNo = `${COAL_BILLING_PREFIX}${updated['化验批次']}`
  const billingRows = listRows(HEATBILLING_KEY)
  if (!billingRows.some((row) => String(row['结算编号']) === billNo)) {
    pushCoalToHeatBilling(updated)
  }

  return { ok: true, message: `批次 ${updated['化验批次']} 化验单已出具，低位发热量 ${calorific} MJ/kg，已推入热费结算待核清单` }
}

// 第三段：补录结算。不许跳级——化验没出结果的批次不能直接结算。
export function settleCoalEntry(batchId: number, input: CoalSettleInput): ActionResult {
  const settleNo = input.结算单号.trim()
  if (!settleNo) {
    return fail('结算单号不能为空，供煤单位按结算单号结账')
  }
  const settleDate = input.结算日期.trim() || todayText()

  const rows = listRows(COAL_KEY)
  const index = rows.findIndex((row) => Number(row.id) === batchId)
  if (index < 0) {
    return fail(`没有找到编号为 ${batchId} 的化验批次`)
  }
  const current = rows[index]
  if (current.status === '待化验') {
    return fail(`批次 ${current['化验批次']} 化验结果未出，化验先出、结算随后补录，不许跳级`)
  }
  if (current.status === '已结算') {
    return fail(`批次 ${current['化验批次']} 已按 ${current['结算单号']} 结账，不能重复结算`)
  }
  if (rows.some((row) => row.id !== current.id && String(row['结算单号'] ?? '') === settleNo)) {
    return fail(`结算单号 ${settleNo} 已用于其他化验批次，不能重复结账`)
  }

  const updated: EntryRow = {
    ...current,
    status: '已结算',
    pending: false,
    结算单号: settleNo,
    结算日期: settleDate,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(COAL_KEY, next)

  // 热费结算待核清单里同批次那条随之标记为已核算（仍在结算模块留痕，不删不跳）。
  const billNo = `${COAL_BILLING_PREFIX}${updated['化验批次']}`
  const billingRows = listRows(HEATBILLING_KEY)
  const billingIndex = billingRows.findIndex((row) => String(row['结算编号']) === billNo)
  if (billingIndex >= 0) {
    const billingNext = [...billingRows]
    billingNext[billingIndex] = {
      ...billingRows[billingIndex],
      status: '已核算',
      pending: true,
      热价标准: `${billingRows[billingIndex]['热价标准']} · 煤款结算单 ${settleNo}`,
      缴费日期: settleDate,
      结算状态: '已核算',
    }
    saveRows(HEATBILLING_KEY, billingNext)
  } else {
    pushCoalToHeatBilling(updated)
  }

  return { ok: true, message: `批次 ${updated['化验批次']}（${updated['供煤单位']}）已按 ${settleNo} 补录结算` }
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
