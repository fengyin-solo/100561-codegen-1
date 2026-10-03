import { listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 燃料煤质化验与入场计量台账：过磅计量先行、化验出结论、结算随后补录，三级不许跳级。
// 计量一律以过磅单为准；化验口径沿用「收到基低位发热量」，单位 kcal/kg。
export const COAL_KEY = 'coaltest'
export const HEATBILLING_KEY = 'heatbilling'

export const COAL_STATUS = {
  waiting: '待化验',
  tested: '已化验',
  settled: '已结算',
} as const

export const COAL_FIELDS = {
  batch: '化验批次',
  supplier: '供煤单位',
  trucks: '进场车数',
  weighDate: '过磅日期',
  weighNo: '过磅单号',
  testDate: '化验日期',
  calorific: '低位发热量(kcal/kg)',
  amount: '结算金额(元)',
  settleDate: '结算日期',
} as const

// 化验结论落到热费结算的待核清单时，打在结算行上的来源标记。
export const COAL_BILLING_SOURCE = '煤质化验'

export type CoalBatch = EntryRow

export type CoalStats = {
  total: number
  waiting: number
  pendingSettlement: number
}

function ok(message: string): ActionResult {
  return { ok: true, message }
}

function fail(message: string): ActionResult {
  return { ok: false, message }
}

function positiveInt(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) {
    return null
  }
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function positiveNumber(raw: string): number | null {
  const text = raw.trim()
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) {
    return null
  }
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : null
}

function sameText(a: unknown, b: unknown): boolean {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function findBatch(rows: EntryRow[], batch: string): EntryRow | undefined {
  return rows.find((row) => sameText(row[COAL_FIELDS.batch], batch))
}

export function listCoalBatches(): CoalBatch[] {
  return listRows(COAL_KEY)
}

export function coalStats(): CoalStats {
  const rows = listCoalBatches()
  return {
    total: rows.length,
    waiting: rows.filter((row) => String(row.status) === COAL_STATUS.waiting).length,
    pendingSettlement: rows.filter((row) => String(row.status) === COAL_STATUS.tested).length,
  }
}

export type WeighInput = {
  batch: string
  supplier: string
  trucks: string
  weighDate: string
  weighNo: string
}

// 进厂先过磅：供煤单位空着不许落账；进场车数填成无效值直接挡回。
export function createWeighEntry(input: WeighInput): ActionResult {
  const batch = input.batch.trim()
  const supplier = input.supplier.trim()
  const weighNo = input.weighNo.trim()
  const weighDate = input.weighDate.trim()
  if (!batch) {
    return fail('化验批次不能为空，先给这批入场煤编个批次号')
  }
  if (!supplier) {
    return fail('供煤单位空着不许落账，请按过磅单补全供煤单位')
  }
  const trucks = positiveInt(input.trucks)
  if (trucks === null) {
    return fail('进场车数无效：必须是大于 0 的整数（以过磅单为准），请重填')
  }
  if (!weighNo) {
    return fail('过磅单号不能为空，计量以过磅单为准')
  }
  if (!weighDate) {
    return fail('过磅日期不能为空')
  }
  const rows = listRows(COAL_KEY)
  if (findBatch(rows, batch)) {
    return fail(`化验批次「${batch}」已经立账，重复过磅登记只留一条`)
  }
  const row: EntryRow = {
    id: nextId(rows),
    status: COAL_STATUS.waiting,
    pending: true,
    abnormal: false,
    [COAL_FIELDS.batch]: batch,
    [COAL_FIELDS.supplier]: supplier,
    [COAL_FIELDS.trucks]: trucks,
    [COAL_FIELDS.weighDate]: weighDate,
    [COAL_FIELDS.weighNo]: weighNo,
    [COAL_FIELDS.testDate]: '',
    [COAL_FIELDS.calorific]: '',
    [COAL_FIELDS.amount]: '',
    [COAL_FIELDS.settleDate]: '',
  }
  saveRows(COAL_KEY, [...rows, row])
  return ok(`批次「${batch}」已按过磅单立账（${supplier}，${trucks} 车），化验单出来后再提交化验`)
}

export type TestInput = {
  batch: string
  trucks: string
  testDate: string
  calorific: string
}

// 化验先出：化验单上的进场车数必须与过磅单两处一致；重复提交化验单只留一条。
export function submitTestReport(input: TestInput): ActionResult {
  const batch = input.batch.trim()
  const rows = listRows(COAL_KEY)
  const index = rows.findIndex((row) => sameText(row[COAL_FIELDS.batch], batch))
  if (index < 0) {
    return fail(`没有找到化验批次「${batch}」，请先凭过磅单立账`)
  }
  const current = rows[index]
  if (String(current.status) !== COAL_STATUS.waiting) {
    return fail(`批次「${batch}」化验单已留存（当前「${current.status}」），重复提交只留一条`)
  }
  const trucks = positiveInt(input.trucks)
  if (trucks === null) {
    return fail('化验单上的进场车数无效：必须是大于 0 的整数，请核对化验室记录')
  }
  // 过磅单与化验单两处读到的进场车数必须一致，沿用既有化验口径。
  if (trucks !== Number(current[COAL_FIELDS.trucks])) {
    return fail(
      `进场车数对不上：过磅单为 ${current[COAL_FIELDS.trucks]} 车，化验单填了 ${trucks} 车，请回化验室核对`,
    )
  }
  const testDate = input.testDate.trim()
  if (!testDate) {
    return fail('化验日期不能为空')
  }
  const calorific = positiveNumber(input.calorific)
  if (calorific === null) {
    return fail('低位发热量无效：必须是大于 0 的数字（沿用收到基低位发热量口径，kcal/kg）')
  }

  const updated: EntryRow = {
    ...current,
    status: COAL_STATUS.tested,
    pending: true,
    [COAL_FIELDS.testDate]: testDate,
    [COAL_FIELDS.calorific]: calorific,
  }
  const nextRows = [...rows]
  nextRows[index] = updated
  saveRows(COAL_KEY, nextRows)

  pushBillingPending(updated)
  return ok(`批次「${batch}」化验结论已入账：收到基低位发热量 ${calorific} kcal/kg，已转入热费结算待核清单`)
}

// 化验结论落到热费结算的待核清单；同一批次只挂一条。
function pushBillingPending(batch: EntryRow): void {
  const billing = listRows(HEATBILLING_KEY)
  const batchNo = String(batch[COAL_FIELDS.batch])
  const exists = billing.some((row) => sameText(row['关联批次'], batchNo) && row['业务来源'] === COAL_BILLING_SOURCE)
  if (exists) {
    return
  }
  const row: EntryRow = {
    id: nextId(billing),
    status: '待核算',
    pending: true,
    abnormal: false,
    结算编号: batchNo,
    用户名称: `${batch[COAL_FIELDS.supplier]}（入场燃煤煤款）`,
    用热面积: '—',
    热价标准: `低位发热量 ${batch[COAL_FIELDS.calorific]} kcal/kg（收到基）`,
    应缴金额: '',
    缴费日期: '',
    收费员: '',
    结算状态: '待核算',
    业务来源: COAL_BILLING_SOURCE,
    关联批次: batchNo,
    化验结论: `收到基低位发热量 ${batch[COAL_FIELDS.calorific]} kcal/kg，化验日期 ${batch[COAL_FIELDS.testDate]}`,
  }
  saveRows(HEATBILLING_KEY, [...billing, row])
}

export type SettlementInput = {
  batch: string
  amount: string
  settleDate: string
}

// 结算随后补录：只有「已化验」的批次能补录结算，不许跳过化验直接结算。
export function supplementSettlement(input: SettlementInput): ActionResult {
  const batch = input.batch.trim()
  const rows = listRows(COAL_KEY)
  const index = rows.findIndex((row) => sameText(row[COAL_FIELDS.batch], batch))
  if (index < 0) {
    return fail(`没有找到化验批次「${batch}」`)
  }
  const current = rows[index]
  const status = String(current.status)
  if (status === COAL_STATUS.waiting) {
    return fail(`批次「${batch}」化验单还没出，化验先出、结算随后补录，不许跳级`)
  }
  if (status === COAL_STATUS.settled) {
    return fail(`批次「${batch}」已经补录过结算，不能重复结账`)
  }
  const amount = positiveNumber(input.amount)
  if (amount === null) {
    return fail('结算金额无效：必须是大于 0 的数字（元）')
  }
  const settleDate = input.settleDate.trim()
  if (!settleDate) {
    return fail('结算日期不能为空')
  }

  const updated: EntryRow = {
    ...current,
    status: COAL_STATUS.settled,
    pending: false,
    [COAL_FIELDS.amount]: amount,
    [COAL_FIELDS.settleDate]: settleDate,
  }
  const nextRows = [...rows]
  nextRows[index] = updated
  saveRows(COAL_KEY, nextRows)

  confirmBillingPending(String(updated[COAL_FIELDS.batch]), amount, settleDate)
  return ok(`批次「${batch}」已向供煤单位「${updated[COAL_FIELDS.supplier]}」补录结算 ${amount} 元，待核清单已核销`)
}

// 结算补录后，把热费结算待核清单里对应的一条从「待核算」核掉。
function confirmBillingPending(batchNo: string, amount: number, settleDate: string): void {
  const billing = listRows(HEATBILLING_KEY)
  let changed = false
  const next = billing.map((row) => {
    if (row['业务来源'] === COAL_BILLING_SOURCE && sameText(row['关联批次'], batchNo)) {
      changed = true
      return {
        ...row,
        status: '已核算',
        pending: false,
        应缴金额: amount,
        缴费日期: settleDate,
        结算状态: '已核算',
      }
    }
    return row
  })
  if (changed) {
    saveRows(HEATBILLING_KEY, next)
  }
}

// 热费结算的待核清单：化验已出、结算未补的批次都挂在这里。
export function listBillingPending(): EntryRow[] {
  return listRows(HEATBILLING_KEY).filter(
    (row) => row['业务来源'] === COAL_BILLING_SOURCE && String(row.status) === '待核算',
  )
}

export function resetCoalLedger(): void {
  resetRows(COAL_KEY)
  resetRows(HEATBILLING_KEY)
}
