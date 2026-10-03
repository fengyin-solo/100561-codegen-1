<template>
  <section class="page" data-module="coaltest">
    <header class="page-head">
      <div>
        <h2>燃料煤质化验与燃煤入场计量台账</h2>
        <p class="page-desc">
          按化验批次立账，逐栏登记供煤单位、进场车数与收到基低位发热量（kcal/kg）；
          计量以过磅单为准，化验先出、结算随后补录，不许跳级；化验结论同步热费结算待核清单。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openWeigh">凭过磅单立账</button>
        <button class="btn" type="button" @click="exportRows">导出台账</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>化验批次</span>
        <input v-model="filters.batch" placeholder="按化验批次检索" />
      </label>
      <label class="filter-item">
        <span>供煤单位</span>
        <input v-model="filters.supplier" placeholder="按供煤单位检索" />
      </label>
      <button class="btn" type="button" @click="resetFilters">重置条件</button>
    </form>

    <h3 class="section-title">化验批次看板（按化验进度分栏）</h3>
    <div class="board">
      <section
        v-for="column in boardColumns"
        :key="column.status"
        class="board-col"
        :class="`board-col--${column.tone}`"
      >
        <header class="board-head">
          <span>{{ column.status }}</span>
          <em>{{ batchesByStatus(column.status).length }}</em>
        </header>
        <p v-if="column.hint" class="board-hint">{{ column.hint }}</p>
        <div class="board-body">
          <article
            v-for="row in filteredByStatus(column.status)"
            :key="String(row.id)"
            class="batch-card"
          >
            <div class="batch-card-head">
              <strong>{{ row[COAL_FIELDS.batch] }}</strong>
              <span class="batch-truck">{{ row[COAL_FIELDS.trucks] }} 车</span>
            </div>
            <p class="batch-supplier">{{ row[COAL_FIELDS.supplier] }}</p>
            <dl class="batch-meta">
              <div><dt>过磅单号</dt><dd>{{ row[COAL_FIELDS.weighNo] }}</dd></div>
              <div><dt>过磅日期</dt><dd>{{ row[COAL_FIELDS.weighDate] }}</dd></div>
              <div>
                <dt>化验日期</dt>
                <dd>{{ row[COAL_FIELDS.testDate] || '待出结果' }}</dd>
              </div>
              <div>
                <dt>低位发热量</dt>
                <dd>
                  <template v-if="row[COAL_FIELDS.calorific] !== ''">
                    {{ row[COAL_FIELDS.calorific] }} kcal/kg
                  </template>
                  <template v-else>—</template>
                </dd>
              </div>
              <div v-if="row[COAL_FIELDS.amount] !== ''">
                <dt>结算金额</dt><dd>{{ row[COAL_FIELDS.amount] }} 元</dd>
              </div>
              <div v-if="row[COAL_FIELDS.settleDate] !== ''">
                <dt>结算日期</dt><dd>{{ row[COAL_FIELDS.settleDate] }}</dd>
              </div>
            </dl>
            <div class="batch-actions">
              <button
                v-if="String(row.status) === COAL_STATUS.waiting"
                class="link"
                type="button"
                @click="openTest(String(row[COAL_FIELDS.batch]))"
              >
                提交化验单
              </button>
              <button
                v-if="String(row.status) === COAL_STATUS.tested"
                class="link"
                type="button"
                @click="openSettle(String(row[COAL_FIELDS.batch]))"
              >
                补录结算
              </button>
              <span v-else-if="String(row.status) === COAL_STATUS.settled" class="batch-done">
                已向供煤单位结账
              </span>
            </div>
          </article>
          <p v-if="!filteredByStatus(column.status).length" class="board-empty">本栏暂无批次</p>
        </div>
      </section>
    </div>

    <h3 class="section-title">台账明细（计量以过磅单为准）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in ledgerColumns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in filteredRows" :key="String(row.id)">
          <td v-for="column in ledgerColumns" :key="column">{{ displayValue(row, column) }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-if="String(row.status) === COAL_STATUS.waiting"
              class="link"
              type="button"
              @click="openTest(String(row[COAL_FIELDS.batch]))"
            >
              提交化验单
            </button>
            <button
              v-if="String(row.status) === COAL_STATUS.tested"
              class="link"
              type="button"
              @click="openSettle(String(row[COAL_FIELDS.batch]))"
            >
              补录结算
            </button>
            <span v-if="String(row.status) === COAL_STATUS.settled" class="muted-text">已结账</span>
          </td>
        </tr>
        <tr v-if="!filteredRows.length">
          <td :colspan="ledgerColumns.length + 2" class="empty-state">
            暂无化验批次，入场燃煤过完磅后先凭过磅单立账
          </td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">热费结算待核清单（化验结论）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>结算编号</th>
          <th>供煤单位（煤款）</th>
          <th>化验口径</th>
          <th>化验结论</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in pendingBilling" :key="String(row.id)">
          <td>{{ row['结算编号'] }}</td>
          <td>{{ row['用户名称'] }}</td>
          <td>{{ row['热价标准'] }}</td>
          <td>{{ row['化验结论'] }}</td>
          <td>待核（补录结算后核销）</td>
        </tr>
        <tr v-if="!pendingBilling.length">
          <td colspan="5" class="empty-state">待核清单为空：化验结论出具后自动挂账，结算补录后自动核销</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ rows.length }} 个化验批次 · 数据保存在本机浏览器里</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="dialog.open" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <header class="modal-head">
          <h3>{{ dialogTitle }}</h3>
          <button class="link" type="button" @click="closeDialog">关闭</button>
        </header>
        <form class="modal-body" @submit.prevent="submitDialog">
          <template v-if="dialog.mode === 'weigh'">
            <label class="form-item">
              <span>化验批次</span>
              <input v-model="weighForm.batch" placeholder="如 COAL-2026-005" />
            </label>
            <label class="form-item">
              <span>供煤单位</span>
              <input v-model="weighForm.supplier" placeholder="按过磅单填写，空着不许落账" />
            </label>
            <label class="form-item">
              <span>进场车数（过磅单）</span>
              <input v-model="weighForm.trucks" inputmode="numeric" placeholder="大于 0 的整数" />
            </label>
            <label class="form-item">
              <span>过磅单号</span>
              <input v-model="weighForm.weighNo" placeholder="如 WB-20261003-01" />
            </label>
            <label class="form-item">
              <span>过磅日期</span>
              <input v-model="weighForm.weighDate" type="date" />
            </label>
          </template>

          <template v-else-if="dialog.mode === 'test'">
            <label class="form-item">
              <span>化验批次</span>
              <select v-model="testForm.batch" @change="prefillTrucks">
                <option value="" disabled>请选择待化验批次</option>
                <option v-for="row in waitingRows" :key="String(row.id)" :value="String(row[COAL_FIELDS.batch])">
                  {{ row[COAL_FIELDS.batch] }} · {{ row[COAL_FIELDS.supplier] }}
                </option>
              </select>
            </label>
            <label class="form-item">
              <span>进场车数（化验单，须与过磅单一致）</span>
              <input v-model="testForm.trucks" inputmode="numeric" placeholder="两处车数不一致将挡回" />
            </label>
            <label class="form-item">
              <span>化验日期</span>
              <input v-model="testForm.testDate" type="date" />
            </label>
            <label class="form-item">
              <span>低位发热量（收到基，kcal/kg）</span>
              <input v-model="testForm.calorific" inputmode="decimal" placeholder="沿用既有化验口径" />
            </label>
            <p class="form-tip">化验单重复提交同一批次只留一条；结论出具后自动进入热费结算待核清单。</p>
          </template>

          <template v-else>
            <label class="form-item">
              <span>化验批次</span>
              <select v-model="settleForm.batch">
                <option value="" disabled>请选择已化验批次</option>
                <option v-for="row in testedRows" :key="String(row.id)" :value="String(row[COAL_FIELDS.batch])">
                  {{ row[COAL_FIELDS.batch] }} · {{ row[COAL_FIELDS.supplier] }} ·
                  {{ row[COAL_FIELDS.calorific] }} kcal/kg
                </option>
              </select>
            </label>
            <label class="form-item">
              <span>结算金额（元，付给供煤单位）</span>
              <input v-model="settleForm.amount" inputmode="decimal" placeholder="化验先出、结算随后补录" />
            </label>
            <label class="form-item">
              <span>结算日期</span>
              <input v-model="settleForm.settleDate" type="date" />
            </label>
            <p class="form-tip">只有已化验批次允许补录结算，待化验批次不许跳级结账。</p>
          </template>

          <p v-if="dialogError" class="error-text">{{ dialogError }}</p>
          <footer class="modal-foot">
            <button class="btn" type="button" @click="closeDialog">取消</button>
            <button class="btn primary" type="submit">{{ dialogSubmitLabel }}</button>
          </footer>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries } from '@/api/local-service'
import {
  COAL_FIELDS,
  COAL_STATUS,
  coalStats,
  createWeighEntry,
  listBillingPending,
  listCoalBatches,
  submitTestReport,
  supplementSettlement,
} from '@/api/coal-ledger'
import type { EntryRow } from '@/data/types'

const ledgerColumns = [
  COAL_FIELDS.batch,
  COAL_FIELDS.supplier,
  COAL_FIELDS.trucks,
  COAL_FIELDS.weighDate,
  COAL_FIELDS.weighNo,
  COAL_FIELDS.testDate,
  COAL_FIELDS.calorific,
  COAL_FIELDS.amount,
  COAL_FIELDS.settleDate,
]

const boardColumns = [
  { status: COAL_STATUS.waiting, tone: 'waiting', hint: '化验单还散在化验室，结果未出' },
  { status: COAL_STATUS.tested, tone: 'tested', hint: '化验结论已出，待向供煤单位补录结算' },
  { status: COAL_STATUS.settled, tone: 'settled', hint: '化验先出、结算已补，已结账' },
]

const rows = ref<EntryRow[]>([])
const pendingBilling = ref<EntryRow[]>([])
const errorMessage = ref('')
const filters = ref({ batch: '', supplier: '' })

const statCards = computed(() => {
  const stats = coalStats()
  return [
    { label: '化验批次总数', value: stats.total },
    { label: '待化验批次（结果未出）', value: stats.waiting },
    { label: '待核结算批次', value: stats.pendingSettlement },
  ]
})

const filteredRows = computed(() =>
  rows.value.filter((row) => {
    const batchHit = String(row[COAL_FIELDS.batch] ?? '').includes(filters.value.batch.trim())
    const supplierHit = String(row[COAL_FIELDS.supplier] ?? '').includes(filters.value.supplier.trim())
    return batchHit && supplierHit
  }),
)

const waitingRows = computed(() =>
  rows.value.filter((row) => String(row.status) === COAL_STATUS.waiting),
)
const testedRows = computed(() =>
  rows.value.filter((row) => String(row.status) === COAL_STATUS.tested),
)

function batchesByStatus(status: string): EntryRow[] {
  return rows.value.filter((row) => String(row.status) === status)
}

function filteredByStatus(status: string): EntryRow[] {
  return filteredRows.value.filter((row) => String(row.status) === status)
}

function displayValue(row: EntryRow, column: string): string {
  const value = row[column]
  if (value === '' || value === null || value === undefined) {
    return column === COAL_FIELDS.testDate ? '待出结果' : '—'
  }
  return String(value)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

type DialogMode = 'weigh' | 'test' | 'settle'

const dialog = reactive<{ open: boolean; mode: DialogMode }>({ open: false, mode: 'weigh' })
const dialogError = ref('')
const weighForm = reactive({ batch: '', supplier: '', trucks: '', weighDate: today(), weighNo: '' })
const testForm = reactive({ batch: '', trucks: '', testDate: today(), calorific: '' })
const settleForm = reactive({ batch: '', amount: '', settleDate: today() })

const dialogTitle = computed(() => {
  if (dialog.mode === 'weigh') return '凭过磅单立账（入场计量）'
  if (dialog.mode === 'test') return '提交煤质化验单'
  return '补录燃煤结算'
})

const dialogSubmitLabel = computed(() => {
  if (dialog.mode === 'weigh') return '立账'
  if (dialog.mode === 'test') return '提交化验'
  return '补录结算'
})

function resetForms(): void {
  Object.assign(weighForm, { batch: '', supplier: '', trucks: '', weighDate: today(), weighNo: '' })
  Object.assign(testForm, { batch: '', trucks: '', testDate: today(), calorific: '' })
  Object.assign(settleForm, { batch: '', amount: '', settleDate: today() })
  dialogError.value = ''
}

function openWeigh(): void {
  resetForms()
  dialog.mode = 'weigh'
  dialog.open = true
}

function openTest(batch: string): void {
  resetForms()
  dialog.mode = 'test'
  dialog.open = true
  testForm.batch = batch
  prefillTrucks()
}

function openSettle(batch: string): void {
  resetForms()
  dialog.mode = 'settle'
  dialog.open = true
  settleForm.batch = batch
}

function closeDialog(): void {
  dialog.open = false
  dialogError.value = ''
}

// 化验单车数默认带出过磅单读数；两处读到的车数不一致会在提交时挡回。
function prefillTrucks(): void {
  const found = rows.value.find((row) => String(row[COAL_FIELDS.batch]) === testForm.batch)
  testForm.trucks = found ? String(found[COAL_FIELDS.trucks]) : ''
}

function submitDialog(): void {
  dialogError.value = ''
  const result =
    dialog.mode === 'weigh'
      ? createWeighEntry({ ...weighForm })
      : dialog.mode === 'test'
        ? submitTestReport({ ...testForm })
        : supplementSettlement({ ...settleForm })
  if (!result.ok) {
    dialogError.value = result.message
    return
  }
  errorMessage.value = ''
  closeDialog()
  reload()
}

function resetFilters(): void {
  filters.value = { batch: '', supplier: '' }
}

function exportRows(): void {
  downloadEntries('coaltest')
}

function reload(): void {
  try {
    rows.value = listCoalBatches()
    pendingBilling.value = listBillingPending()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '燃料煤质台账读取失败'
  }
}

onMounted(reload)
</script>
