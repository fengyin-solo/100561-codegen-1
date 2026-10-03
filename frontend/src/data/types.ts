/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

// 燃料煤台账的三段登记入参：过磅登记、出具化验单、补录结算，全部在 local-service 里做业务校验。
export type CoalRegisterInput = {
  化验批次: string
  供煤单位: string
  过磅单号: string
  过磅车数: string
  进场车数: string
  过磅日期: string
}

export type CoalAssayInput = {
  化验单车数: string
  低位发热量: string
  化验日期: string
}

export type CoalSettleInput = {
  结算单号: string
  结算日期: string
}
