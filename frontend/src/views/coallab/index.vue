<template>
  <section class="page" data-module="coallab">
    <header class="page-head">
      <div>
        <h2>燃料煤质化验与燃煤入场计量台账</h2>
        <p class="page-desc">
          按化验批次分栏立账：过磅登记计量以过磅单为准，化验先出、结算随后补录，不许跳级；
          低位发热量沿用既有化验口径（收到基 Qnet,ar MJ/kg），化验结论落到热费结算待核清单。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openRegister">过磅登记</button>
        <button class="btn" type="button" @click="exportRows">导出台账清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>供煤单位</span>
        <input v-model="filters['供煤单位']" placeholder="按供煤单位检索" />
      </label>
      <label class="filter-item">
        <span>化验批次</span>
        <input v-model="filters['化验批次']" placeholder="按化验批次检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div class="board">
      <section v-for="column in columns" :key="column.status" class="board-col">
        <header class="board-col-head">
          <h3>{{ column.status }}</h3>
          <span class="board-count">{{ groups[column.status].length }} 批</span>
        </header>
        <div class="board-cards">
          <article v-for="row in groups[column.status]" :key="String(row.id)" class="batch-card">
            <div class="batch-no">{{ row['化验批次'] }}</div>
            <dl class="batch-fields">
              <div class="batch-line">
                <dt>供煤单位</dt>
                <dd>{{ row['供煤单位'] }}</dd>
              </div>
              <div class="batch-line">
                <dt>进场车数</dt>
                <dd>{{ row['进场车数'] }} 车<span class="muted-inline">（过磅 {{ row['过磅车数'] }} 车一致）</span></dd>
              </div>
              <div class="batch-line">
                <dt>低位发热量</dt>
                <dd>
                  <template v-if="row['低位发热量'] === '' || row['低位发热量'] === undefined">
                    <span class="tag tag-pending">化验结果未出</span>
                  </template>
                  <template v-else>
                    <strong>{{ row['低位发热量'] }}</strong> MJ/kg
                    <span class="muted-inline">（{{ row['化验日期'] }}）</span>
                  </template>
                </dd>
              </div>
              <div class="batch-line">
                <dt>过磅单</dt>
                <dd class="muted-inline">{{ row['过磅单号'] }} · {{ row['过磅日期'] }}</dd>
              </div>
              <div v-if="row.status === '已结算'" class="batch-line">
                <dt>结算</dt>
                <dd class="muted-inline">{{ row['结算单号'] }} · {{ row['结算日期'] }}</dd>
              </div>
            </dl>
            <footer v-if="row.status === '待化验'" class="card-actions">
              <button class="btn primary" type="button" @click="openAssay(row)">出具化验单</button>
            </footer>
            <footer v-else-if="row.status === '已化验'" class="card-actions">
              <span class="tag tag-sent">已入热费结算待核清单</span>
              <button class="btn primary" type="button" @click="openSettle(row)">补录结算</button>
            </footer>
            <footer v-else class="card-actions">
              <span class="tag tag-done">已结账</span>
            </footer>
          </article>
          <p v-if="!groups[column.status].length" class="board-empty">本栏暂无批次</p>
        </div>
      </section>
    </div>

    <footer class="page-foot">
      <span>共 {{ total }} 个化验批次 · 供煤单位空着不许落账 · 重复化验单只留一条</span>
      <span v-if="pageMessage" :class="pageOk ? 'ok-text' : 'error-text'">{{ pageMessage }}</span>
    </footer>

    <!-- 第一段：过磅登记 -->
    <div v-if="dialog === 'register'" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <h3>过磅登记（计量以过磅单为准）</h3>
        <div class="form-grid">
          <label class="form-item">
            <span>化验批次</span>
            <input v-model="registerForm.化验批次" placeholder="如 MY-202610-004" />
          </label>
          <label class="form-item">
            <span>供煤单位（必填）</span>
            <input v-model="registerForm.供煤单位" placeholder="供煤单位空着不许落账" />
          </label>
          <label class="form-item">
            <span>过磅单号（必填）</span>
            <input v-model="registerForm.过磅单号" placeholder="如 WB-20261003-02" />
          </label>
          <label class="form-item">
            <span>过磅车数（正整数）</span>
            <input v-model="registerForm.过磅车数" placeholder="过磅单上的车数" />
          </label>
          <label class="form-item">
            <span>进场车数（正整数）</span>
            <input v-model="registerForm.进场车数" placeholder="进厂点登记车数，须与过磅一致" />
          </label>
          <label class="form-item">
            <span>过磅日期</span>
            <input v-model="registerForm.过磅日期" type="date" />
          </label>
        </div>
        <p v-if="dialogError" class="error-text">{{ dialogError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeDialog">取消</button>
          <button class="btn primary" type="button" @click="submitRegister">落账（待化验）</button>
        </div>
      </div>
    </div>

    <!-- 第二段：出具化验单 -->
    <div v-if="dialog === 'assay'" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <h3>出具化验单 · {{ assayForm.batch }}</h3>
        <p class="modal-hint">沿用既有化验口径：收到基低位发热量 Qnet,ar（MJ/kg）。重复提交同一批次化验单只留一条。</p>
        <div class="form-grid">
          <label class="form-item">
            <span>化验单进场车数（正整数）</span>
            <input v-model="assayForm.化验单车数" placeholder="须与过磅登记车数一致" />
          </label>
          <label class="form-item">
            <span>低位发热量（MJ/kg，正数）</span>
            <input v-model="assayForm.低位发热量" placeholder="如 22.86" />
          </label>
          <label class="form-item">
            <span>化验日期</span>
            <input v-model="assayForm.化验日期" type="date" />
          </label>
        </div>
        <p v-if="dialogError" class="error-text">{{ dialogError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeDialog">取消</button>
          <button class="btn primary" type="button" @click="submitAssay">出具化验单</button>
        </div>
      </div>
    </div>

    <!-- 第三段：补录结算 -->
    <div v-if="dialog === 'settle'" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <h3>补录结算 · {{ settleForm.batch }}</h3>
        <p class="modal-hint">化验已先出，结算随后补录；化验结论已在热费结算待核清单，结账后标记为已核算。</p>
        <div class="form-grid">
          <label class="form-item">
            <span>结算单号（必填）</span>
            <input v-model="settleForm.结算单号" placeholder="供煤单位按此单号结账" />
          </label>
          <label class="form-item">
            <span>结算日期</span>
            <input v-model="settleForm.结算日期" type="date" />
          </label>
        </div>
        <p v-if="dialogError" class="error-text">{{ dialogError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeDialog">取消</button>
          <button class="btn primary" type="button" @click="submitSettle">确认补录结算</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  issueCoalAssay,
  listEntries,
  moduleMeta,
  registerCoalEntry,
  settleCoalEntry,
  suggestCoalBatch,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('coallab')

const columns = [
  { status: '待化验' },
  { status: '已化验' },
  { status: '已结算' },
] as const

const rows = ref<EntryRow[]>([])
const total = ref(0)
const filters = ref<Record<string, string>>({})
const pageMessage = ref('')
const pageOk = ref(true)

const groups = computed<Record<string, EntryRow[]>>(() => {
  const grouped: Record<string, EntryRow[]> = { 待化验: [], 已化验: [], 已结算: [] }
  for (const row of rows.value) {
    const status = String(row.status)
    if (grouped[status]) {
      grouped[status].push(row)
    }
  }
  return grouped
})

const stats = computed(() => {
  const assayed = rows.value.filter((row) => row['低位发热量'] !== '' && row['低位发热量'] !== undefined)
  const average = assayed.length
    ? (assayed.reduce((sum, row) => sum + Number(row['低位发热量']), 0) / assayed.length).toFixed(2)
    : '—'
  return [
    { label: '待化验批次', value: groups.value['待化验'].length },
    { label: '已化验批次', value: groups.value['已化验'].length },
    { label: '已结算批次', value: groups.value['已结算'].length },
    { label: '平均低位发热量 MJ/kg', value: average },
  ]
})

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

// ---- 三段登记弹窗 ----
const dialog = ref<'' | 'register' | 'assay' | 'settle'>('')
const dialogError = ref('')

function today() {
  return new Date().toISOString().slice(0, 10)
}

const registerForm = reactive({
  化验批次: '',
  供煤单位: '',
  过磅单号: '',
  过磅车数: '',
  进场车数: '',
  过磅日期: today(),
})

const assayForm = reactive({
  id: 0,
  batch: '',
  化验单车数: '',
  低位发热量: '',
  化验日期: today(),
})

const settleForm = reactive({
  id: 0,
  batch: '',
  结算单号: '',
  结算日期: today(),
})

function closeDialog() {
  dialog.value = ''
  dialogError.value = ''
}

function openRegister() {
  pageMessage.value = ''
  Object.assign(registerForm, {
    化验批次: suggestCoalBatch(),
    供煤单位: '',
    过磅单号: '',
    过磅车数: '',
    进场车数: '',
    过磅日期: today(),
  })
  dialogError.value = ''
  dialog.value = 'register'
}

function openAssay(row: EntryRow) {
  pageMessage.value = ''
  Object.assign(assayForm, {
    id: Number(row.id),
    batch: String(row['化验批次']),
    化验单车数: String(row['进场车数']),
    低位发热量: '',
    化验日期: today(),
  })
  dialogError.value = ''
  dialog.value = 'assay'
}

function openSettle(row: EntryRow) {
  pageMessage.value = ''
  Object.assign(settleForm, {
    id: Number(row.id),
    batch: String(row['化验批次']),
    结算单号: '',
    结算日期: today(),
  })
  dialogError.value = ''
  dialog.value = 'settle'
}

function submitRegister() {
  const result = registerCoalEntry({ ...registerForm })
  if (!result.ok) {
    dialogError.value = result.message
    return
  }
  closeDialog()
  pageOk.value = true
  pageMessage.value = result.message
  reload()
}

function submitAssay() {
  const result = issueCoalAssay(assayForm.id, {
    化验单车数: assayForm.化验单车数,
    低位发热量: assayForm.低位发热量,
    化验日期: assayForm.化验日期,
  })
  if (!result.ok) {
    dialogError.value = result.message
    return
  }
  closeDialog()
  pageOk.value = true
  pageMessage.value = result.message
  reload()
}

function submitSettle() {
  const result = settleCoalEntry(settleForm.id, {
    结算单号: settleForm.结算单号,
    结算日期: settleForm.结算日期,
  })
  if (!result.ok) {
    dialogError.value = result.message
    return
  }
  closeDialog()
  pageOk.value = true
  pageMessage.value = result.message
  reload()
}

function reload() {
  pageMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    pageOk.value = false
    pageMessage.value = error instanceof Error ? error.message : '燃料煤台账读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.ok-text { color: #067647; }
.muted-inline { color: var(--muted); font-size: 12px; font-weight: 400; }

.board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: start; }
.board-col { background: #eef2f7; border: 1px solid var(--border); border-radius: 8px; padding: 10px; min-height: 240px; }
.board-col-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.board-col-head h3 { font-size: 14px; margin: 0; }
.board-count { font-size: 12px; color: var(--muted); background: #fff; border-radius: 999px; padding: 1px 10px; }
.board-cards { display: flex; flex-direction: column; gap: 8px; }
.batch-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
.batch-no { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
.batch-fields { margin: 0; display: flex; flex-direction: column; gap: 4px; }
.batch-line { display: flex; gap: 8px; font-size: 13px; }
.batch-line dt { color: var(--muted); width: 72px; flex: none; }
.batch-line dd { margin: 0; }
.card-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 8px; }
.board-empty { text-align: center; color: var(--muted); font-size: 13px; padding: 24px 0; }

.tag { border-radius: 999px; padding: 1px 10px; font-size: 12px; }
.tag-pending { background: #fef3c7; color: #92400e; }
.tag-sent { background: #e0e7ff; color: #3730a3; }
.tag-done { background: #dcfce7; color: #166534; }

.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: #fff; border-radius: 10px; padding: 18px 20px; width: 640px; max-width: calc(100vw - 32px); max-height: calc(100vh - 48px); overflow: auto; }
.modal h3 { margin: 0 0 10px; font-size: 16px; }
.modal-hint { font-size: 12px; color: var(--muted); margin: 0 0 12px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.form-item span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 3px; }
.form-item input { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>

