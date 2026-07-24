import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'
import './App.css'

let currentAuthToken: string | null = null

type SectionId = 'dashboard' | 'risks' | 'analysis' | 'reports' | 'chat'
type Tone = 'mint' | 'amber' | 'rose' | 'violet' | 'sky'
type Direction = 'up' | 'down' | 'flat' | 'muted'

type ProductRow = {
  id: string
  display_name: string
  default_unit: string | null
  category_name: string | null
  sort_order: number | null
}

type PriceRecordRow = {
  product_id: string
  price_date: string
  price: number | null
  county_code: string
  county_name: string | null
  unit: string | null
  data_status: string
  is_mock: boolean
}

type PricePoint = {
  date: string
  price: number
  unit: string
  countyCode: string
  countyName: string
}

type RegionSeries = {
  countyCode: string
  countyName: string
  points: PricePoint[]
}

type DashboardCard = {
  productId: string
  name: string
  category: string
  unit: string
  latestPrice: number | null
  latestDate: string | null
  changeRate: number
  trend: number[]
  series: PricePoint[]
  regionSeries: RegionSeries[]
  hasPriceData: boolean
  hasMockData: boolean
  tone: Tone
}

type AnalysisPoint = {
  month: string
  price: number | null
  unit: string
  sampleCount: number
}

type AnalysisStats = {
  averagePrice: number | null
  highPrice: number | null
  lowPrice: number | null
  changeRate: number | null
  startMonth: string | null
  endMonth: string | null
}

type AnalysisHandle = 'start' | 'end'

type RiskRow = {
  id: string
  product_id: string
  county_code: string
  period_start: string
  period_end: string
  risk_score: number | null
  risk_grade: string
  source_price_count: number
  evidence: Record<string, unknown>
  data_quality: Record<string, unknown>
  products?: ProductRow | ProductRow[] | null
}

type RiskCard = {
  id: string
  productId: string
  name: string
  countyCode: string
  periodStart: string
  periodEnd: string
  riskScore: number | null
  riskGrade: string
  sourcePriceCount: number
  evidence: Record<string, unknown>
  dataQuality: Record<string, unknown>
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  meta?: string
}

type AskAiResponse = {
  route: 'numeric' | 'semantic' | 'hybrid' | 'ambiguous'
  intent?: Record<string, unknown>
  filter?: Record<string, unknown>
  numericEvidence?: Record<string, unknown>
  semanticEvidence?: Record<string, unknown>
}

type RagResponse = {
  answer: string
  persistenceStatus?: string
  conversationId?: string | null
  userMessageId?: string | null
  assistantMessageId?: string | null
}

type GenerateReportResponse = {
  report?: ReportDraft
  title?: string
  summary?: string
  content?: string
  highRiskSummary?: string[]
  marketWatch?: string[]
  actionNotes?: string[]
  dataQuality?: string[]
}

type ReportDraft = {
  title: string
  summary: string
  content: string
  highRiskSummary: string[]
  marketWatch: string[]
  actionNotes: string[]
  dataQuality: string[]
}

type SavedReportRow = {
  id: string
  product_id: string | null
  title: string
  summary: string | null
  content: string
  period_start: string | null
  period_end: string | null
  created_at: string
}

type ConversationRow = {
  id: string
  title: string | null
  last_message_at: string | null
  created_at: string
}

type MessageRow = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: string
  model_name: string | null
  created_at: string
}

const DEFAULT_COUNTY_CODE = '3613'
const TARGET_COUNTIES = [
  { code: '3511', name: '전주' },
  { code: '3613', name: '순천' },
  { code: '2401', name: '광주' },
]
const TARGET_COUNTY_CODES = TARGET_COUNTIES.map((county) => county.code)
const LOOKBACK_DAYS = 30
const ANALYSIS_LOOKBACK_MONTHS = 18

const navItems: Array<{ id: SectionId; label: string; hint: string }> = [
  { id: 'dashboard', label: '대시보드', hint: '오늘 시세' },
  { id: 'analysis', label: '가격추이', hint: '월별 흐름' },
  { id: 'risks', label: '위험분석', hint: '수급 경고' },
  { id: 'reports', label: '보고서', hint: 'AI 요약' },
  { id: 'chat', label: '채팅', hint: 'AI 질의' },
]

function App() {
  const supabase = useMemo(() => createClient(getSupabaseUrl(), getSupabaseAnonKey()), [])
  const [authSession, setAuthSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [section, setSection] = useState<SectionId>('dashboard')
  const [products, setProducts] = useState<ProductRow[]>([])
  const [dashboardCards, setDashboardCards] = useState<DashboardCard[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedAnalysisProductId, setSelectedAnalysisProductId] = useState<string | null>(null)
  const [selectedAnalysisStartIndex, setSelectedAnalysisStartIndex] = useState(0)
  const [selectedAnalysisEndIndex, setSelectedAnalysisEndIndex] = useState(0)
  const [analysisPoints, setAnalysisPoints] = useState<AnalysisPoint[]>([])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [selectedReportProductId, setSelectedReportProductId] = useState('all')
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null)
  const [reportRunning, setReportRunning] = useState(false)
  const [reportSaving, setReportSaving] = useState(false)
  const [reportSaveStatus, setReportSaveStatus] = useState<string | null>(null)
  const [savedReports, setSavedReports] = useState<SavedReportRow[]>([])
  const [selectedSavedReport, setSelectedSavedReport] = useState<SavedReportRow | null>(null)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [riskCards, setRiskCards] = useState<RiskCard[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [riskLoading, setRiskLoading] = useState(false)
  const [riskSearch, setRiskSearch] = useState('')
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastRiskRunAt, setLastRiskRunAt] = useState<string | null>(null)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '전라도 농수산물 가격, 위험도, 보고서에 대해 질문해 주세요.',
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const analysisInitializedProductRef = useRef<string | null>(null)

  const riskCounts = useMemo(() => {
    const high = riskCards.filter((item) => item.riskGrade === 'high').length
    const watch = riskCards.filter((item) => item.riskGrade === 'watch').length
    const stable = riskCards.filter((item) => item.riskGrade === 'stable').length
    return { high, watch, stable }
  }, [riskCards])

  const filteredRiskCards = useMemo(() => {
    const query = riskSearch.trim().toLowerCase()
    if (!query) return riskCards
    return riskCards.filter((item) => item.name.toLowerCase().includes(query))
  }, [riskCards, riskSearch])

  const selectedProduct = useMemo(
    () => dashboardCards.find((item) => item.productId === selectedProductId) ?? null,
    [dashboardCards, selectedProductId],
  )
  const selectedAnalysisProduct = useMemo(
    () => products.find((item) => item.id === selectedAnalysisProductId) ?? products[0] ?? null,
    [products, selectedAnalysisProductId],
  )
  const analysisRangeRef = useRef<HTMLDivElement | null>(null)
  const analysisWindowPoints = useMemo(
    () => analysisPoints.slice(selectedAnalysisStartIndex, selectedAnalysisEndIndex + 1),
    [analysisPoints, selectedAnalysisStartIndex, selectedAnalysisEndIndex],
  )
  const analysisStats = useMemo(() => buildAnalysisStats(analysisWindowPoints), [analysisWindowPoints])
  const analysisMonthMarks = useMemo(() => buildAnalysisMonthMarks(analysisPoints), [analysisPoints])
  const selectedProductDailyRows = useMemo(() => (selectedProduct ? buildDailyRegionRows(selectedProduct) : []), [selectedProduct])
  const dashboardHasMockData = useMemo(() => dashboardCards.some((item) => item.hasMockData), [dashboardCards])
  const reportSummary = useMemo(
    () => buildReportSummary(dashboardCards, riskCards, lastSyncedAt, lastRiskRunAt, selectedReportProductId),
    [dashboardCards, riskCards, lastSyncedAt, lastRiskRunAt, selectedReportProductId],
  )

  useEffect(() => {
    currentAuthToken = authSession?.access_token ?? null
  }, [authSession?.access_token])

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setAuthSession(data.session)
      setAuthReady(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session)
      setAuthReady(true)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!authReady) return
    if (!authSession) {
      setChatMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: '전라도 농수산물 가격, 위험도, 보고서에 대해 질문해 주세요.',
        },
      ])
      setCurrentConversationId(null)
      return
    }

    void loadChatHistory()
  }, [authReady, authSession?.user.id])

  useEffect(() => {
    if (!authReady || !authSession) return
    void loadDashboard()
    void loadRisks()
  }, [authReady, authSession?.user.id])

  useEffect(() => {
    if (section !== 'analysis' || !selectedAnalysisProduct) return
    void loadAnalysis(selectedAnalysisProduct.id)
  }, [section, selectedAnalysisProduct?.id])

  useEffect(() => {
    if (analysisPoints.length === 0 || !selectedAnalysisProduct) return

    if (analysisInitializedProductRef.current === selectedAnalysisProduct.id) return

    analysisInitializedProductRef.current = selectedAnalysisProduct.id
    setSelectedAnalysisStartIndex(0)
    setSelectedAnalysisEndIndex(analysisPoints.length - 1)
  }, [analysisPoints, selectedAnalysisProduct?.id])

  useEffect(() => {
    if (section !== 'reports') return
    void loadSavedReports()
  }, [section])

  useEffect(() => {
    if (!selectedProduct) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedProductId(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedProduct])

  async function loadDashboard() {
    setDashboardLoading(true)
    setGlobalError(null)
    try {
      const loadedProducts = await fetchProducts()
      setProducts(loadedProducts)

      const productIds = loadedProducts.map((product) => product.id)
      const records = productIds.length > 0 ? await fetchPriceRecords(productIds, TARGET_COUNTY_CODES, LOOKBACK_DAYS) : []
      setDashboardCards(buildDashboardCards(loadedProducts, records))
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      setGlobalError(toMessage(error))
    } finally {
      setDashboardLoading(false)
    }
  }

  async function syncDashboardFromBackend() {
    setDashboardLoading(true)
    setGlobalError(null)
    try {
      await invokeFunction('sync-kamis-prices', { countyCodes: TARGET_COUNTY_CODES })
      await loadDashboard()
    } catch (error) {
      setGlobalError(toMessage(error))
    } finally {
      setDashboardLoading(false)
    }
  }

  async function loadRisks() {
    setRiskLoading(true)
    setGlobalError(null)
    try {
      const loadedProducts = products.length > 0 ? products : await fetchProducts()
      if (products.length === 0) setProducts(loadedProducts)

      const records = await fetchRiskResults(
        loadedProducts.map((product) => product.id),
        DEFAULT_COUNTY_CODE,
      )
      setRiskCards(buildRiskCards(records, loadedProducts))
      setLastRiskRunAt(new Date().toISOString())
    } catch (error) {
      setGlobalError(toMessage(error))
    } finally {
      setRiskLoading(false)
    }
  }

  async function recalculateRisks() {
    setRiskLoading(true)
    setGlobalError(null)
    try {
      const targetIds = products.map((product) => product.id)
      await invokeFunction('calculate-risks', {
        countyCodes: [DEFAULT_COUNTY_CODE],
        productIds: targetIds.length > 0 ? targetIds : undefined,
      })
      await loadRisks()
    } catch (error) {
      setGlobalError(toMessage(error))
    } finally {
      setRiskLoading(false)
    }
  }

  async function loadAnalysis(productId: string) {
    setAnalysisLoading(true)
    setGlobalError(null)
    try {
      const product = products.find((item) => item.id === productId) ?? null
      const records = await fetchAnalysisPriceRecords(productId, TARGET_COUNTY_CODES, ANALYSIS_LOOKBACK_MONTHS)
      setAnalysisPoints(buildMonthlyAveragePoints(records, product, ANALYSIS_LOOKBACK_MONTHS))
    } catch (error) {
      setGlobalError(toMessage(error))
    } finally {
      setAnalysisLoading(false)
    }
  }

  function updateAnalysisRange(handle: AnalysisHandle, clientX: number) {
    const container = analysisRangeRef.current
    if (!container || analysisPoints.length === 0) return

    const rect = container.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)))
    const nextIndex = Math.round(ratio * Math.max(analysisPoints.length - 1, 0))

    if (handle === 'start') {
      setSelectedAnalysisStartIndex(Math.min(nextIndex, selectedAnalysisEndIndex))
      return
    }

    setSelectedAnalysisEndIndex(Math.max(nextIndex, selectedAnalysisStartIndex))
  }

  async function syncMonthlyAnalysisFromBackend() {
    setAnalysisLoading(true)
    setGlobalError(null)
    try {
      await invokeFunction('sync-kamis-prices', {
        countyCodes: TARGET_COUNTY_CODES,
        includeDaily: false,
        includeMonthly: true,
        monthlyMonths: ANALYSIS_LOOKBACK_MONTHS,
      })
      const productId = selectedAnalysisProduct?.id ?? products[0]?.id
      if (productId) await loadAnalysis(productId)
    } catch (error) {
      setGlobalError(toMessage(error))
    } finally {
      setAnalysisLoading(false)
    }
  }

  async function loadSavedReports() {
    setReportsLoading(true)
    try {
      const reports = await fetchSavedReports()
      setSavedReports(reports)
    } catch (error) {
      setGlobalError(toMessage(error))
    } finally {
      setReportsLoading(false)
    }
  }

  async function loadChatHistory() {
    try {
      const conversations = await fetchConversations()
      if (conversations.length === 0) {
        setChatMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: '전라도 농수산물 가격, 위험도, 보고서에 대해 질문해 주세요.',
          },
        ])
        setCurrentConversationId(null)
        return
      }

      const latestConversation = conversations.find((conversation) => conversation.title || conversation.last_message_at) ?? conversations[0]
      const messages = await fetchMessages(latestConversation.id)
      setCurrentConversationId(latestConversation.id)
      setChatMessages(
        messages.length > 0
          ? messages.map((message) => ({
              id: message.id,
              role: message.role === 'assistant' ? 'assistant' : 'user',
              content: message.content,
              meta: message.role === 'assistant' ? `${message.status}${message.model_name ? ` · ${message.model_name}` : ''}` : undefined,
            }))
          : [
              {
                id: 'welcome',
                role: 'assistant',
                content: '전라도 농수산물 가격, 위험도, 보고서에 대해 질문해 주세요.',
              },
            ],
      )
    } catch (error) {
      setGlobalError(toMessage(error))
      setChatMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: '전라도 농수산물 가격, 위험도, 보고서에 대해 질문해 주세요.',
        },
      ])
      setCurrentConversationId(null)
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authEmail.trim() || !authPassword.trim() || authSubmitting) return

    setAuthSubmitting(true)
    setAuthError(null)
    try {
      const email = authEmail.trim()
      const password = authPassword.trim()
      const result =
        authMode === 'login'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password })

      if (result.error) throw result.error
      setAuthPassword('')
    } catch (error) {
      setAuthError(toMessage(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setAuthError(null)
    setAuthPassword('')
    setCurrentConversationId(null)
    setSelectedSavedReport(null)
    setChatMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: '전라도 농수산물 가격, 위험도, 보고서에 대해 질문해 주세요.',
      },
    ])
  }

  async function generateReportDraft() {
    setReportRunning(true)
    setReportSaveStatus(null)
    try {
      const generated = await invokeFunction<GenerateReportResponse>('generate-report', {
        summary: reportSummary,
      })
      setReportDraft(normalizeGeneratedReport(generated.report ?? generated, reportSummary))
    } catch (error) {
      setReportDraft(buildReportDraft(reportSummary))
      setReportSaveStatus(`AI 보고서 생성에 실패해 기본 템플릿으로 표시했습니다. (${toMessage(error)})`)
    } finally {
      setReportRunning(false)
    }
  }

  async function saveReportDraft() {
    if (!reportDraft) return

    setReportSaving(true)
    setReportSaveStatus(null)
    try {
      await invokeFunction('save-report', {
        title: reportDraft.title,
        summary: reportDraft.summary,
        content: reportDraft.content,
        productId: selectedReportProductId === 'all' ? null : selectedReportProductId,
        periodStart: reportSummary.periodStart,
        periodEnd: reportSummary.periodEnd,
      })
      setReportSaveStatus('보고서를 저장했습니다.')
      await loadSavedReports()
    } catch (error) {
      setReportSaveStatus(`저장 실패: ${toMessage(error)}`)
    } finally {
      setReportSaving(false)
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = chatInput.trim()
    if (!question || chatLoading) return
    if (!authSession) {
      setAuthError('로그인 후 채팅을 사용할 수 있습니다.')
      return
    }

    setChatInput('')
    setChatLoading(true)
    setGlobalError(null)

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }
    const pendingAssistantId = `assistant-${Date.now()}`

    setChatMessages((current) => [
      ...current,
      userMessage,
      {
        id: pendingAssistantId,
        role: 'assistant',
        content: '답변을 준비하고 있습니다.',
      },
    ])

    try {
      const routed = await invokeFunction<AskAiResponse>('ask-ai', {
        question,
        routeHint: 'auto',
      })
      const answer = await invokeFunction<RagResponse>('generate-rag-answer', {
        question,
        route: routed.route,
        intent: routed.intent,
        filter: routed.filter,
        numericEvidence: routed.numericEvidence,
        semanticEvidence: routed.semanticEvidence,
        conversationId: currentConversationId ?? undefined,
      })

      if (answer.conversationId) {
        setCurrentConversationId(answer.conversationId)
      }
      setChatMessages((current) =>
        current.map((message) =>
          message.id === pendingAssistantId
            ? {
                ...message,
                content: answer.answer,
                meta: `경로 ${routed.route}${answer.persistenceStatus ? ` · ${answer.persistenceStatus}` : ''}`,
              }
            : message,
        ),
      )
    } catch (error) {
      setChatMessages((current) =>
        current.map((message) =>
          message.id === pendingAssistantId
            ? {
                ...message,
                content: `채팅 연결 중 오류가 발생했습니다. ${toMessage(error)}`,
              }
            : message,
        ),
      )
    } finally {
      setChatLoading(false)
    }
  }

  if (!authReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">Jeolla Agri</p>
          <h1>로그인 정보를 확인하는 중...</h1>
          <p>세션을 불러오고 있습니다.</p>
        </div>
      </div>
    )
  }

  if (!authSession) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-card__header">
            <div>
              <p className="eyebrow">Jeolla Agri</p>
              <h1>전라도 농수산물 가격과 위험 정보</h1>
            </div>
            <p className="auth-card__subtitle">로그인 후 시세, 위험분석, 채팅 기록을 이어서 사용할 수 있습니다.</p>
          </div>

          <div className="auth-switch">
            <button type="button" className={authMode === 'login' ? 'is-active' : ''} onClick={() => setAuthMode('login')}>
              로그인
            </button>
            <button type="button" className={authMode === 'signup' ? 'is-active' : ''} onClick={() => setAuthMode('signup')}>
              회원가입
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label className="auth-field">
              <span>이메일</span>
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label className="auth-field">
              <span>비밀번호</span>
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                placeholder="비밀번호"
              />
            </label>
            {authError ? <div className="auth-error">{authError}</div> : null}
            <button type="submit" className="action-button auth-submit" disabled={authSubmitting}>
              {authSubmitting ? '처리 중...' : authMode === 'login' ? '로그인' : '회원가입'}
            </button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__auth">
          <div>
            <strong>{authSession.user.email ?? '로그인 사용자'}</strong>
            <small>세션 유지 중</small>
          </div>
          <button
            type="button"
            className="icon-button icon-button--logout"
            onClick={() => void handleSignOut()}
            aria-label="로그아웃"
            title="로그아웃"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M10 17l1.4-1.4L8.8 13H21v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 5h6V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h6v-2H4V5z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${section === item.id ? 'is-active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Jeolla Agri</p>
            <h1>전라도 농수산물 가격과 위험 정보</h1>
          </div>
          <div className="topbar__meta">
            <div className="meta-pill">
              <strong>{products.length}</strong>
              <span>품목</span>
            </div>
            <div className="meta-pill">
              <strong>{riskCounts.high}</strong>
              <span>고위험</span>
            </div>
            <div className="meta-pill">
              <strong>{riskCounts.watch}</strong>
              <span>주의</span>
            </div>
            <div className="meta-pill">
              <strong>{riskCounts.stable}</strong>
              <span>안정</span>
            </div>
          </div>
        </header>

        {globalError ? <div className="banner banner--error">{globalError}</div> : null}

        {section === 'dashboard' ? (
          <section className="page-stack">
            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">시세 대시보드</p>
                  <h3>오늘 가격과 최근 30일 추이</h3>
                </div>
                <div className="panel__actions">
                  {dashboardHasMockData ? <span className="chip chip--warning">테스트 시세 포함</span> : null}
                  <span className="chip chip--muted">
                    {dashboardLoading ? '불러오는 중...' : `최근 동기화 ${formatTime(lastSyncedAt)}`}
                  </span>
                  <button type="button" className="action-button" onClick={() => void syncDashboardFromBackend()}>
                    시세 동기화
                  </button>
                </div>
              </div>

              <div className="commodity-grid">
                {dashboardCards.map((item) => (
                  <button
                    key={item.productId}
                    type="button"
                    className={`commodity-card commodity-card--${priceDirection(item.changeRate, item.hasPriceData)} ${
                      selectedProductId === item.productId ? 'is-active' : ''
                    }`}
                    onClick={() => setSelectedProductId(item.productId)}
                  >
                    <div className="commodity-card__top">
                      <div className="commodity-card__title">
                        <strong>{item.name}</strong>
                        <small>{item.category}</small>
                      </div>
                      <div className="commodity-card__badges">
                        {item.hasMockData ? <span className="mock-badge">테스트 시세</span> : null}
                        <span className={`rank-pill rank-pill--${priceDirection(item.changeRate, item.hasPriceData)}`}>
                          {priceDirectionLabel(item.changeRate, item.hasPriceData)}
                        </span>
                      </div>
                    </div>

                    <div className="commodity-card__price">
                      <strong>{formatPrice(item.latestPrice)}</strong>
                      <span>{item.unit}</span>
                    </div>

                    <div className={`commodity-card__change change--${changeTone(item.changeRate, item.hasPriceData)}`}>
                      {item.hasPriceData ? formatChange(item.changeRate) : '가격 이력 없음'}
                    </div>

                    <MemoSparkline points={item.trend} tone={item.tone} />
                    <p className="card-footnote">{item.latestDate ? `평균 기준 ${item.latestDate}` : '기준일 없음'}</p>
                  </button>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {section === 'risks' ? (
          <section className="page-stack">
            <section className="panel">
              <div className="panel__header risk-panel-header">
                <div className="risk-header">
                  <p className="eyebrow">위험분석</p>
                  <div className="risk-header__title-row">
                    <h3>위험 등급과 수급 경고</h3>
                    <label className="risk-search" aria-label="Risk card search">
                      <input
                        type="search"
                        value={riskSearch}
                        onChange={(event) => setRiskSearch(event.target.value)}
                        placeholder="예: 배추, 무"
                      />
                    </label>
                  </div>
                </div>
                <div className="panel__actions">
                  <span className="chip chip--muted">
                    {riskLoading ? '계산 중...' : `최근 계산 ${formatTime(lastRiskRunAt)}`}
                  </span>
                  {riskSearch.trim() ? <span className="chip chip--muted">{filteredRiskCards.length}개 결과</span> : null}
                  <button type="button" className="action-button" onClick={() => void recalculateRisks()}>
                    위험 재계산
                  </button>
                </div>
              </div>

              <div className="risk-grid">
                {filteredRiskCards.map((item) => (
                  <article key={item.id} className="risk-card">
                    <div className="risk-card__top">
                      <div>
                        <p className="eyebrow">{item.countyCode}</p>
                        <strong>{item.name}</strong>
                      </div>
                      <span className={`chip chip--${riskTone(item.riskGrade)}`}>{riskLabel(item.riskGrade)}</span>
                    </div>
                    <div className="risk-card__score">
                      {item.riskScore == null ? '점수 없음' : `${item.riskScore.toFixed(1)}점`}
                    </div>
                    <p className="risk-card__meta">
                      {item.periodStart} - {item.periodEnd} · 표본 {item.sourcePriceCount}건
                    </p>
                    <div className="risk-meter">
                      <span style={{ width: `${Math.min(item.riskScore ?? 0, 100)}%` }} />
                    </div>
                    <div className="risk-card__section">
                      <strong>부분 점수와 가중치</strong>
                      <div className="risk-components">
                        {getRiskComponents(item).map((component) => (
                          <div key={component.key} className="risk-component">
                            <span>{component.label}</span>
                            <b>
                              {component.score.toFixed(1)} / {component.weight.toFixed(0)}
                            </b>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="risk-card__section">
                      <strong>데이터 충분성</strong>
                      <div className="risk-quality">
                        <span>유효 {formatNumber(getNumber(item.dataQuality, 'validPriceCount'))}건</span>
                        <span>전체 {formatNumber(getNumber(item.dataQuality, 'totalRecordCount'))}건</span>
                        <span>결측 {formatRatio(getNumber(item.dataQuality, 'missingRatio'))}</span>
                      </div>
                    </div>
                    <div className="risk-card__section">
                      <strong>계산 불가 항목</strong>
                      <ul className="risk-notes">
                        {getUnavailableReasons(item).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="risk-card__section">
                      <strong>주의 메시지</strong>
                      <ul className="risk-notes risk-notes--warning">
                        {getRiskWarnings(item).map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {section === 'analysis' ? (
          <section className="analysis-page">
            <section className="panel analysis-picker">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">가격추이 검색</p>
                  <h3>품목 선택</h3>
                </div>
                <span className="chip chip--muted">{products.length}개 품목</span>
              </div>
              <div className="analysis-product-list">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={`analysis-product ${selectedAnalysisProduct?.id === product.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setSelectedAnalysisProductId(product.id)
                      void loadAnalysis(product.id)
                    }}
                  >
                    <strong>{product.display_name}</strong>
                  </button>
                ))}
              </div>
              <div className="analysis-period-row">
                <div className="analysis-period-row__label">
                  <p className="eyebrow">기간</p>
                  <strong>기간 선택</strong>
                  <span className="analysis-period-value">
                    {analysisStats.startMonth && analysisStats.endMonth
                      ? `${formatMonthLabel(analysisStats.startMonth)} ~ ${formatMonthLabel(analysisStats.endMonth)}`
                      : '기간 데이터 없음'}
                  </span>
                </div>
                <div className="analysis-period-sliders">
                  <div className="analysis-period-range" ref={analysisRangeRef}>
                    <div className="analysis-period-range__track" aria-hidden="true">
                      <div
                        className="analysis-period-range__fill"
                        style={{
                          left: `${(Math.min(selectedAnalysisStartIndex, selectedAnalysisEndIndex) / Math.max(analysisPoints.length - 1, 1)) * 100}%`,
                          width: `${((Math.max(selectedAnalysisStartIndex, selectedAnalysisEndIndex) - Math.min(selectedAnalysisStartIndex, selectedAnalysisEndIndex)) / Math.max(analysisPoints.length - 1, 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="analysis-period-range__thumb analysis-period-range__thumb--start"
                      style={{
                        left: `${(selectedAnalysisStartIndex / Math.max(analysisPoints.length - 1, 1)) * 100}%`,
                      }}
                      aria-label="Start of analysis range"
                      aria-valuemin={0}
                      aria-valuemax={Math.max(analysisPoints.length - 1, 0)}
                      aria-valuenow={selectedAnalysisStartIndex}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId)
                        updateAnalysisRange('start', event.clientX)
                      }}
                      onPointerMove={(event) => {
                        if ((event.buttons & 1) === 0) return
                        updateAnalysisRange('start', event.clientX)
                      }}
                      onPointerUp={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId)
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="analysis-period-range__thumb analysis-period-range__thumb--end"
                      style={{
                        left: `${(selectedAnalysisEndIndex / Math.max(analysisPoints.length - 1, 1)) * 100}%`,
                      }}
                      aria-label="End of analysis range"
                      aria-valuemin={0}
                      aria-valuemax={Math.max(analysisPoints.length - 1, 0)}
                      aria-valuenow={selectedAnalysisEndIndex}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId)
                        updateAnalysisRange('end', event.clientX)
                      }}
                      onPointerMove={(event) => {
                        if ((event.buttons & 1) === 0) return
                        updateAnalysisRange('end', event.clientX)
                      }}
                      onPointerUp={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId)
                        }
                      }}
                    />
                  </div>
                  <div className="analysis-period-scale" aria-hidden="true">
                    {analysisMonthMarks.length > 0 ? (
                      analysisMonthMarks.map((month) => <span key={month}>{formatMonthLabel(month)}</span>)
                    ) : (
                      <>
                        <span>-</span>
                        <span>-</span>
                        <span>-</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="panel analysis-chart-panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">가격추이 그래프</p>
                  <h3>
                    {selectedAnalysisProduct
                        ? `${selectedAnalysisProduct.display_name} ${analysisStats.startMonth && analysisStats.endMonth ? `${formatMonthLabel(analysisStats.startMonth)} ~ ${formatMonthLabel(analysisStats.endMonth)}` : '추이 없음'}`
                        : analysisStats.startMonth && analysisStats.endMonth
                          ? `${formatMonthLabel(analysisStats.startMonth)} ~ ${formatMonthLabel(analysisStats.endMonth)} 추이`
                          : '추이 없음'
                    }
                  </h3>
                </div>
                <div className="panel__actions">
                  <span className="chip chip--muted">
                    {analysisLoading
                      ? '불러오는 중...'
                      : analysisStats.startMonth && analysisStats.endMonth
                        ? `${formatMonthLabel(analysisStats.startMonth)} ~ ${formatMonthLabel(analysisStats.endMonth)}`
                        : '기간 없음'}
                  </span>
                  <button type="button" className="action-button" onClick={() => void syncMonthlyAnalysisFromBackend()}>
                    월별 데이터 동기화
                  </button>
                </div>
              </div>
              <div className="analysis-stat-grid">
                <article className="analysis-stat">
                  <span>평균</span>
                  <strong>{formatPrice(analysisStats.averagePrice)}</strong>
                </article>
                <article className="analysis-stat">
                  <span>최고</span>
                  <strong>{formatPrice(analysisStats.highPrice)}</strong>
                </article>
                <article className="analysis-stat">
                  <span>최저</span>
                  <strong>{formatPrice(analysisStats.lowPrice)}</strong>
                </article>
                <article className="analysis-stat">
                  <span>변화율</span>
                  <strong>{analysisStats.changeRate == null ? '-' : formatChange(analysisStats.changeRate)}</strong>
                </article>
              </div>
              <MemoMonthlyAverageChart points={analysisWindowPoints} unit={selectedAnalysisProduct?.default_unit ?? ''} />
              <div className="analysis-footnote">
                <span>출처: KAMIS 소매가격</span>
                <span>갱신 시각: {formatTime(lastSyncedAt)}</span>
                <span>기간: {analysisStats.startMonth ? formatMonthLabel(analysisStats.startMonth) : '없음'} - {analysisStats.endMonth ? formatMonthLabel(analysisStats.endMonth) : '없음'}</span>
              </div>
            </section>
          </section>
        ) : null}

        {section === 'reports' ? (
          <section className="report-page">
            <section className="panel report-cover">
              <div>
                <p className="eyebrow">AI 보고서</p>
                <h2>대상 품목 위험 보고서 작성</h2>
                <p>
                  분석 대상을 선택한 뒤 보고서 작성을 누르면 해당 품목의 위험 상태와 시장 관찰 내용을 AI 보고서로 정리합니다.
                </p>
              </div>
              <div className="report-cover__actions">
                <span className="chip chip--muted">가격 기준 {reportSummary.latestPriceDate ?? '없음'}</span>
                <button type="button" className="action-button" onClick={generateReportDraft} disabled={reportRunning}>
                  {reportRunning ? '작성 중...' : '보고서 작성'}
                </button>
              </div>
            </section>

            <section className="panel report-controls">
              <div>
                <p className="eyebrow">분석 대상</p>
                <h3>분석 대상 선택</h3>
              </div>
              <div className="report-targets">
                <button
                  type="button"
                  className={`report-target ${selectedReportProductId === 'all' ? 'is-active' : ''}`}
                  onClick={() => setSelectedReportProductId('all')}
                >
                  전체 품목
                </button>
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={`report-target ${selectedReportProductId === product.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedReportProductId(product.id)}
                  >
                    {product.display_name}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel report-section">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">저장 및 조회</p>
                  <h3>보고서 저장 및 과거 보고서 조회</h3>
                </div>
                <div className="panel__actions">
                  <button type="button" className="action-button" onClick={() => window.print()} disabled={!reportDraft}>
                    인쇄
                  </button>
                  <button type="button" className="action-button" onClick={() => void saveReportDraft()} disabled={!reportDraft || reportSaving}>
                    {reportSaving ? '저장 중...' : '보고서 저장'}
                  </button>
                  <button type="button" className="action-button" onClick={() => void loadSavedReports()}>
                    새로고침
                  </button>
                </div>
              </div>
              {reportSaveStatus ? <div className="report-status">{reportSaveStatus}</div> : null}
              {reportDraft ? (
                <div className="report-document">
                  <h3>{reportDraft.title}</h3>
                  <p>{reportDraft.summary}</p>
                  <pre>{reportDraft.content}</pre>
                </div>
              ) : (
                <div className="detail-empty">아직 생성된 보고서가 없습니다. 분석 대상을 선택한 뒤 보고서 작성을 실행해 주세요.</div>
              )}
              <div className="saved-report-list">
                <h4>{reportsLoading ? '과거 보고서를 불러오는 중...' : '과거 보고서'}</h4>
                {savedReports.length > 0 ? (
                  savedReports.map((report) => (
                    <article
                      key={report.id}
                      className="saved-report-item saved-report-item--clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSavedReport(report)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedSavedReport(report)
                        }
                      }}
                    >
                      <div>
                        <strong>{report.title}</strong>
                        <span>{formatTime(report.created_at)} · {report.period_end ?? '기간 없음'}</span>
                      </div>
                      <p>{report.summary ?? '요약 없음'}</p>
                    </article>
                  ))
                ) : (
                  <div className="detail-empty">저장된 공개 보고서가 없습니다.</div>
                )}
              </div>
            </section>
          </section>
        ) : null}

        {selectedSavedReport ? (
          <section
            className="detail-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-report-title"
            onClick={() => setSelectedSavedReport(null)}
          >
            <div className="detail-shell report-detail-shell" onClick={(event) => event.stopPropagation()}>
              <header className="detail-header">
                <div>
                  <p className="eyebrow">저장된 보고서</p>
                  <h2 id="saved-report-title">{selectedSavedReport.title}</h2>
                  <p className="detail-subtitle">
                    {formatTime(selectedSavedReport.created_at)} · {selectedSavedReport.period_end ?? '기간 없음'}
                  </p>
                </div>
                <div className="detail-header__actions">
                  <button type="button" className="action-button" onClick={() => setSelectedSavedReport(null)}>
                    닫기
                  </button>
                </div>
              </header>

              <div className="detail-summary">
                <div className="detail-summary__card">
                  <span>요약</span>
                  <strong>{selectedSavedReport.summary ?? '요약 없음'}</strong>
                </div>
                <div className="detail-summary__card">
                  <span>대상 품목</span>
                  <strong>{selectedSavedReport.product_id ?? '전체 품목'}</strong>
                </div>
                <div className="detail-summary__card">
                  <span>기간</span>
                  <strong>
                    {selectedSavedReport.period_start ?? '없음'} ~ {selectedSavedReport.period_end ?? '없음'}
                  </strong>
                </div>
              </div>

              <section className="report-document report-document--detail">
                <p>본문</p>
                <pre>{selectedSavedReport.content}</pre>
              </section>
            </div>
          </section>
        ) : null}

        {section === 'chat' ? (
          <section className="chat-shell">
            <section className="panel chat-panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">AI 채팅</p>
                  <h3>가격과 위험에 대해 바로 질문하기</h3>
                </div>
                <span className="chip chip--muted">{chatLoading ? '답변 생성 중...' : 'AI 연결됨'}</span>
              </div>

              <div className="chat-thread">
                {chatMessages.map((message) => (
                  <div key={message.id} className={`chat-bubble chat-bubble--${message.role}`}>
                    <p>{message.content}</p>
                    {message.meta ? <small>{message.meta}</small> : null}
                  </div>
                ))}
              </div>

              <form className="chat-composer" onSubmit={handleChatSubmit}>
                <textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                  placeholder="예: 최근 배추 가격이 전월보다 얼마나 올랐어?"
                  rows={4}
                />
                <button type="submit" className="action-button" disabled={chatLoading}>
                  보내기
                </button>
              </form>
            </section>
          </section>
        ) : null}

        {selectedProduct ? (
          <section
            className="detail-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-detail-title"
            onClick={() => setSelectedProductId(null)}
          >
            <div className="detail-shell" onClick={(event) => event.stopPropagation()}>
              <header className="detail-header">
                <div>
                  <p className="eyebrow">품목 상세</p>
                  <h2 id="price-detail-title">{selectedProduct.name}</h2>
                  <p className="detail-subtitle">
                    {selectedProduct.category} · {selectedProduct.unit}
                  </p>
                </div>
                <div className="detail-header__actions">
                  <button type="button" className="action-button" onClick={() => setSelectedProductId(null)}>
                    닫기
                  </button>
                </div>
              </header>

              <div className="detail-summary">
                <div className="detail-summary__card">
                  <span>평균 현재가</span>
                  <strong>{formatPrice(selectedProduct.latestPrice)}</strong>
                </div>
                <div className="detail-summary__card">
                  <span>평균 변동률</span>
                  <strong>{selectedProduct.hasPriceData ? formatChange(selectedProduct.changeRate) : '-'}</strong>
                </div>
                <div className="detail-summary__card">
                  <span>기준일</span>
                  <strong>{selectedProduct.latestDate ?? '없음'}</strong>
                </div>
              </div>

              <div className="detail-grid">
                <section className="detail-chart panel">
                  <div className="panel__header">
                    <div>
                      <p className="eyebrow">가격 그래프</p>
                      <h3>지역별 최근 30일 가격 그래프</h3>
                    </div>
                  </div>
                  <MemoRegionalPriceChart product={selectedProduct} />
                </section>

                <aside className="detail-list panel">
                  <div className="panel__header">
                    <div>
                      <p className="eyebrow">일별 가격</p>
                      <h3>일별 지역 가격</h3>
                    </div>
                  </div>
                  <div className="detail-list__body">
                    {selectedProduct.series.length > 0 ? (
                      selectedProductDailyRows.map((row) => (
                        <div key={row.date} className="detail-row detail-row--multi">
                          <strong>{row.date}</strong>
                          <div className="detail-region-prices">
                            {TARGET_COUNTIES.map((county) => {
                              const point = row.prices.get(county.code)
                              return (
                                <span key={county.code}>
                                  <b>{county.name}</b>
                                  {point ? `${formatPrice(point.price)} ${point.unit}` : '-'}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="detail-empty">표시할 가격 이력이 없습니다.</div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

function Sparkline({ points, tone }: { points: number[]; tone: Tone }) {
  if (points.length < 2) {
    return <div className="sparkline-empty">최근 30일 가격 데이터 없음</div>
  }

  const width = 120
  const height = 44
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = Math.max(max - min, 1)
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width
      const y = height - ((point - min) / range) * (height - 8) - 4
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className={`sparkline sparkline--${tone}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

const MemoSparkline = memo(Sparkline)

function RegionalPriceChart({ product }: { product: DashboardCard }) {
  if (product.series.length < 2) {
    return <div className="detail-empty">최근 30일 가격 데이터가 충분하지 않습니다.</div>
  }

  const width = 760
  const height = 260
  const paddingX = 44
  const paddingY = 44
  const paddingBottom = 60
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY - paddingBottom
  const allPoints = product.regionSeries.flatMap((region) => region.points)
  const prices = allPoints.map((point) => point.price)
  const min = Math.floor(Math.min(...prices) / 100) * 100
  const rawMax = Math.ceil(Math.max(...prices) / 100) * 100
  const tickCount = 4
  const step = Math.max(Math.ceil((rawMax - min) / Math.max(tickCount - 1, 1) / 100) * 100, 100)
  const max = min + step * (tickCount - 1)
  const range = Math.max(max - min, 1)
  const dates = product.series.map((point) => point.date)
  const dateIndex = new Map(dates.map((date, index) => [date, index]))

  const scalePoint = (point: PricePoint) => {
    const index = dateIndex.get(point.date) ?? 0
    const x = paddingX + (index / Math.max(dates.length - 1, 1)) * chartWidth
    const y = paddingY + chartHeight - ((point.price - min) / range) * chartHeight
    return { ...point, x, y }
  }

  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const value = max - index * step
    const y = paddingY + (index / (tickCount - 1)) * chartHeight
    return { value, y }
  })
  const dateTickCount = Math.min(6, dates.length)
  const dateTicks = Array.from({ length: dateTickCount }, (_, index) => {
    const dateIndexValue = Math.round((index / Math.max(dateTickCount - 1, 1)) * (dates.length - 1))
    const date = dates[dateIndexValue]
    const x = paddingX + (dateIndexValue / Math.max(dates.length - 1, 1)) * chartWidth
    return { date, x }
  })
  const xAxisY = paddingY + chartHeight

  return (
    <div className="price-chart-wrap">
      <div className="region-legend region-legend--floating">
        {TARGET_COUNTIES.map((county) => (
          <span key={county.code}>
            <i className={`legend-dot legend-dot--${county.code}`} />
            {county.name}
          </span>
        ))}
      </div>
      <svg className="price-chart price-chart--regions" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Regional price trend chart">
        {ticks.map((tick) => (
          <g key={`${tick.value}-${tick.y}`}>
            <line x1={paddingX} x2={width - paddingX} y1={tick.y} y2={tick.y} className="price-chart__grid" />
            <text x={10} y={tick.y + 4} className="price-chart__axis-label">
              {Math.round(tick.value).toLocaleString('ko-KR')}
            </text>
          </g>
        ))}

        {dateTicks.map((tick) => (
          <g key={tick.date}>
            <line x1={tick.x} x2={tick.x} y1={paddingY} y2={xAxisY} className="price-chart__date-grid" />
            <line x1={tick.x} x2={tick.x} y1={xAxisY} y2={xAxisY + 6} className="price-chart__date-tick" />
            <text x={tick.x} y={xAxisY + 26} className="price-chart__date-axis-label" textAnchor="middle">
              {formatShortDate(tick.date)}
            </text>
          </g>
        ))}

        <line x1={paddingX} x2={width - paddingX} y1={xAxisY} y2={xAxisY} className="price-chart__x-axis" />

        {product.regionSeries.map((region) => {
          const points = region.points.filter((point) => dateIndex.has(point.date)).map(scalePoint)
          return <path key={region.countyCode} d={toPath(points)} className={`price-chart__line price-chart__line--${region.countyCode}`} />
        })}

        {product.regionSeries.flatMap((region) =>
          region.points
            .filter((point) => dateIndex.has(point.date))
            .map(scalePoint)
            .map((point, index) => (
              <circle
                key={`${region.countyCode}-${point.date}-${index}`}
                cx={point.x}
                cy={point.y}
                r="4.5"
                className={`price-chart__dot price-chart__dot--${region.countyCode}`}
              />
            )),
        )}
      </svg>
    </div>
  )
}

const MemoRegionalPriceChart = memo(RegionalPriceChart)

function MonthlyAverageChart({ points, unit }: { points: AnalysisPoint[]; unit: string }) {
  const pricedPoints = points.filter((point): point is AnalysisPoint & { price: number } => typeof point.price === 'number')
  if (points.length < 2 || pricedPoints.length === 0) {
    return <div className="analysis-empty">선택한 기간에 월별 평균을 그릴 만큼 가격 데이터가 없습니다.</div>
  }

  const width = 980
  const height = 430
  const paddingX = 64
  const paddingTop = 54
  const paddingBottom = 72
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingTop - paddingBottom
  const prices = pricedPoints.map((point) => point.price)
  const min = Math.floor(Math.min(...prices) / 100) * 100
  const rawMax = Math.ceil(Math.max(...prices) / 100) * 100
  const tickCount = 5
  const step = Math.max(Math.ceil((rawMax - min) / Math.max(tickCount - 1, 1) / 100) * 100, 100)
  const max = min + step * (tickCount - 1)
  const range = Math.max(max - min, 1)
  const scaled = points.map((point, index) => {
    const x = paddingX + (index / Math.max(points.length - 1, 1)) * chartWidth
    const y = point.price == null ? null : paddingTop + chartHeight - ((point.price - min) / range) * chartHeight
    return { ...point, x, y }
  })
  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const value = max - index * step
    const y = paddingTop + (index / (tickCount - 1)) * chartHeight
    return { value, y }
  })
  const dateTicks = scaled
  const xAxisY = paddingTop + chartHeight
  const lineSegments = buildLineSegments(scaled)

  return (
    <div className="analysis-chart-wrap">
      <svg className="analysis-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly price trend chart">
        {ticks.map((tick) => (
          <g key={`${tick.value}-${tick.y}`}>
            <line x1={paddingX} x2={width - paddingX} y1={tick.y} y2={tick.y} className="price-chart__grid" />
            <text x={12} y={tick.y + 4} className="price-chart__axis-label">
              {Math.round(tick.value).toLocaleString('ko-KR')}
            </text>
          </g>
        ))}

        {dateTicks.map((tick) => (
          <g key={tick.month}>
            <line x1={tick.x} x2={tick.x} y1={paddingTop} y2={xAxisY} className="price-chart__date-grid" />
            <line x1={tick.x} x2={tick.x} y1={xAxisY} y2={xAxisY + 7} className="price-chart__date-tick" />
            <text x={tick.x} y={xAxisY + 30} className="price-chart__date-axis-label" textAnchor="middle">
              {formatMonthLabel(tick.month)}
            </text>
          </g>
        ))}

        <line x1={paddingX} x2={width - paddingX} y1={xAxisY} y2={xAxisY} className="price-chart__x-axis" />
        {lineSegments.map((segment, index) => (
          <path key={index} d={toPath(segment)} className="analysis-chart__line" />
        ))}

        {scaled
          .filter((point): point is typeof point & { y: number } => point.y != null)
          .map((point) => (
            <circle key={point.month} cx={point.x} cy={point.y} r="5" className="analysis-chart__dot" />
          ))}

        <text x={width - paddingX} y={paddingTop - 18} className="analysis-chart__unit" textAnchor="end">
          단위: {unit || '-'}
        </text>
      </svg>
    </div>
  )
}

const MemoMonthlyAverageChart = memo(MonthlyAverageChart)

function toPath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
}

function buildLineSegments(points: Array<{ x: number; y: number | null }>) {
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []

  for (const point of points) {
    const y = point.y
    if (y == null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      continue
    }

    current.push({ x: point.x, y })
  }

  if (current.length > 0) {
    segments.push(current)
  }

  return segments
}

function buildDailyRegionRows(product: DashboardCard) {
  const rows = new Map<string, { date: string; prices: Map<string, PricePoint> }>()

  for (const region of product.regionSeries) {
    for (const point of region.points) {
      const row = rows.get(point.date) ?? { date: point.date, prices: new Map<string, PricePoint>() }
      row.prices.set(region.countyCode, point)
      rows.set(point.date, row)
    }
  }

  return Array.from(rows.values()).sort((a, b) => b.date.localeCompare(a.date))
}

function formatPrice(value: number | null) {
  if (value == null || Number.isNaN(value)) return '-'
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function formatShortDate(value: string) {
  return value.slice(5).replace('-', '/')
}

function formatMonthLabel(value: string) {
  return value.replace('-', '.')
}

function formatChange(value: number) {
  if (Math.abs(value) < 0.05) return '0.0%'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function changeTone(value: number, hasPriceData = true) {
  if (!hasPriceData) return 'flat'
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

function priceDirection(value: number, hasPriceData = true): Direction {
  if (!hasPriceData) return 'muted'
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

function priceDirectionLabel(value: number, hasPriceData = true) {
  const direction = priceDirection(value, hasPriceData)
  if (direction === 'up') return '상승'
  if (direction === 'down') return '하락'
  if (direction === 'flat') return '보합'
  return '데이터 없음'
}

function riskTone(grade: string) {
  if (grade === 'high') return 'down'
  if (grade === 'watch') return 'flat'
  if (grade === 'stable') return 'ok'
  return 'muted'
}

function riskLabel(grade: string) {
  if (grade === 'high') return '고위험'
  if (grade === 'watch') return '주의'
  if (grade === 'stable') return '안정'
  if (grade === 'insufficient_data') return '데이터 부족'
  return '미분류'
}

function getRiskComponents(item: RiskCard) {
  const scores = getRecord(item.evidence.componentScores)
  const weights = getRecord(item.evidence.weights)
  const definitions = [
    { key: 'periodChange', label: '기간 변화율' },
    { key: 'recentChange', label: '최근 변화율' },
    { key: 'volatility', label: '변동성' },
    { key: 'dataQuality', label: '데이터 품질' },
  ]

  return definitions.map((definition) => ({
    ...definition,
    score: getNumber(scores, definition.key) ?? 0,
    weight: getNumber(weights, definition.key) ?? 0,
  }))
}

function getUnavailableReasons(item: RiskCard) {
  const reasons: string[] = []
  const validCount = getNumber(item.dataQuality, 'validPriceCount') ?? item.sourcePriceCount
  const minValidCount = getNumber(item.dataQuality, 'minValidPriceCount') ?? 5
  const missingRatio = getNumber(item.dataQuality, 'missingRatio') ?? 0
  const maxMissingRatio = getNumber(item.dataQuality, 'maxMissingRatio') ?? 0.5
  const hasLatestPrice = item.dataQuality.hasLatestPrice !== false

  if (item.riskScore == null || item.riskGrade === 'insufficient_data') reasons.push('최종 점수 계산 불가')
  if (validCount < minValidCount) reasons.push(`유효 가격 ${validCount}건으로 기준 ${minValidCount}건 미달`)
  if (missingRatio > maxMissingRatio) reasons.push(`결측률 ${formatRatio(missingRatio)}로 허용 기준 ${formatRatio(maxMissingRatio)} 초과`)
  if (!hasLatestPrice) reasons.push('최신 가격 없음')

  return reasons.length > 0 ? reasons : ['계산 불가 항목 없음']
}

function getRiskWarnings(item: RiskCard) {
  const warnings: string[] = []
  const components = getRiskComponents(item)
  const periodChange = components.find((component) => component.key === 'periodChange')
  const recentChange = components.find((component) => component.key === 'recentChange')
  const volatility = components.find((component) => component.key === 'volatility')
  const dataQuality = components.find((component) => component.key === 'dataQuality')
  const missingRatio = getNumber(item.dataQuality, 'missingRatio') ?? 0

  if (item.riskGrade === 'high') warnings.push('고위험 등급입니다. 가격 급등락과 데이터 품질을 함께 확인하세요.')
  if (item.riskGrade === 'watch') warnings.push('주의 등급입니다. 최근 가격 흐름을 계속 관찰하세요.')
  if (item.riskGrade === 'insufficient_data') warnings.push('데이터가 부족해 위험 점수를 확정할 수 없습니다.')
  if (periodChange && periodChange.weight > 0 && periodChange.score / periodChange.weight >= 0.7) warnings.push('분석 기간 전체 변화율 영향이 큽니다.')
  if (recentChange && recentChange.weight > 0 && recentChange.score / recentChange.weight >= 0.7) warnings.push('최근 가격 변화가 빠르게 나타났습니다.')
  if (volatility && volatility.weight > 0 && volatility.score / volatility.weight >= 0.7) warnings.push('가격 변동성이 높은 편입니다.')
  if ((dataQuality && dataQuality.score > 0) || missingRatio > 0) warnings.push('결측 데이터가 점수에 반영되었습니다.')

  return warnings.length > 0 ? Array.from(new Set(warnings)) : ['특이 주의 메시지 없음']
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function getNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatNumber(value: number | null) {
  return value == null ? '-' : Math.round(value).toLocaleString('ko-KR')
}

function formatRatio(value: number | null) {
  return value == null ? '-' : `${(value * 100).toFixed(1)}%`
}

function formatTime(value: string | null) {
  if (!value) return '없음'
  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchProducts() {
  const data = await restFetch<ProductRow[]>(
    '/rest/v1/products?select=id,display_name,default_unit,category_name,sort_order&is_active=eq.true&order=sort_order.asc',
  )
  return data ?? []
}

async function fetchPriceRecords(productIds: string[], countyCodes: string[], days: number) {
  if (productIds.length === 0 || countyCodes.length === 0) return []

  const startDate = toDateString(addDays(new Date(), -days))
  const query = new URLSearchParams({
    select: 'product_id,price_date,price,county_code,county_name,unit,data_status,is_mock',
    product_id: `in.(${productIds.join(',')})`,
    county_code: `in.(${countyCodes.join(',')})`,
    price_date: `gte.${startDate}`,
    market_name: 'eq.recent_30d',
    order: 'price_date.asc',
  })

  const data = await restFetch<PriceRecordRow[]>(`/rest/v1/price_records?${query.toString()}`)
  return data ?? []
}

async function fetchAnalysisPriceRecords(productId: string, countyCodes: string[], months: number) {
  if (!productId || countyCodes.length === 0) return []

  const query = new URLSearchParams({
    select: 'product_id,price_date,price,county_code,county_name,unit,data_status,is_mock',
    product_id: `eq.${productId}`,
    county_code: `in.(${countyCodes.join(',')})`,
    market_name: 'eq.monthly',
    order: 'price_date.asc',
    limit: String(Math.max(months * countyCodes.length * 4, 100)),
  })

  const data = await restFetch<PriceRecordRow[]>(`/rest/v1/price_records?${query.toString()}`)
  return data ?? []
}

async function fetchRiskResults(productIds: string[], countyCode: string) {
  if (productIds.length === 0) return []

  const query = new URLSearchParams({
    select:
      'id,product_id,county_code,period_start,period_end,risk_score,risk_grade,source_price_count,evidence,data_quality,products(id,display_name,default_unit)',
    is_latest: 'eq.true',
    product_id: `in.(${productIds.join(',')})`,
    county_code: `eq.${countyCode}`,
  })

  const data = await restFetch<RiskRow[]>(`/rest/v1/risk_results?${query.toString()}`)
  return data ?? []
}

function buildDashboardCards(products: ProductRow[], records: PriceRecordRow[]) {
  const recordsByProduct = new Map<string, PriceRecordRow[]>()
  for (const record of records) {
    const current = recordsByProduct.get(record.product_id) ?? []
    current.push(record)
    recordsByProduct.set(record.product_id, current)
  }

  return products.map((product) => {
    const items = (recordsByProduct.get(product.id) ?? []).filter((item) => typeof item.price === 'number')
    const hasMockData = items.some((item) => item.is_mock)
    const rowsByCounty = new Map<string, PriceRecordRow[]>()

    for (const item of items) {
      const current = rowsByCounty.get(item.county_code) ?? []
      current.push(item)
      rowsByCounty.set(item.county_code, current)
    }

    const regionSeries = TARGET_COUNTIES.map((county) => {
      const rows = (rowsByCounty.get(county.code) ?? []).sort((a, b) => a.price_date.localeCompare(b.price_date))
      const points = rows.map((item) => ({
        date: item.price_date,
        price: item.price ?? 0,
        unit: item.unit ?? product.default_unit ?? '',
        countyCode: item.county_code,
        countyName: item.county_name ?? county.name,
      }))

      return {
        countyCode: county.code,
        countyName: county.name,
        points,
      }
    })

    const averagesByDate = new Map<string, { prices: number[]; unit: string }>()
    for (const region of regionSeries) {
      for (const point of region.points) {
        const current = averagesByDate.get(point.date) ?? { prices: [], unit: point.unit }
        current.prices.push(point.price)
        if (!current.unit) current.unit = point.unit
        averagesByDate.set(point.date, current)
      }
    }

    const series = Array.from(averagesByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        price: value.prices.reduce((sum, price) => sum + price, 0) / value.prices.length,
        unit: value.unit || product.default_unit || '',
        countyCode: 'average',
        countyName: '전주·순천·광주 평균',
      }))

    const latest = series.at(-1) ?? null
    const previous = series.length >= 2 ? series.at(-2) ?? null : null
    const trend = series.map((item) => item.price)
    const latestPrice = latest?.price ?? null
    const previousPrice = previous?.price ?? latestPrice
    const hasPriceData = latestPrice !== null && trend.length > 0
    const changeRate =
      latestPrice == null || previousPrice == null || previousPrice === 0
        ? 0
        : ((latestPrice - previousPrice) / previousPrice) * 100

    return {
      productId: product.id,
      name: product.display_name,
      category: product.category_name ?? '품목',
      unit: product.default_unit ?? latest?.unit ?? '',
      latestPrice,
      latestDate: latest?.date ?? null,
      changeRate,
      trend,
      series,
      regionSeries,
      hasPriceData,
      hasMockData,
      tone: 'mint' as Tone,
    }
  })
}

function buildMonthlyAveragePoints(records: PriceRecordRow[], product: ProductRow | null, months: number): AnalysisPoint[] {
  const grouped = new Map<string, { prices: number[]; unit: string }>()

  for (const record of records) {
    if (typeof record.price !== 'number') continue
    const month = record.price_date.slice(0, 7)
    const current = grouped.get(month) ?? { prices: [], unit: record.unit ?? product?.default_unit ?? '' }
    current.prices.push(record.price)
    if (!current.unit) current.unit = record.unit ?? product?.default_unit ?? ''
    grouped.set(month, current)
  }

  const ordered = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      price: value.prices.reduce((sum, price) => sum + price, 0) / value.prices.length,
      unit: value.unit,
      sampleCount: value.prices.length,
    }))
  const endMonth = ordered.at(-1)?.month ?? toMonthString(new Date())
  const monthSequence = buildMonthSequence(endMonth, months)
  const lookup = new Map(ordered.map((item) => [item.month, item] as const))

  return monthSequence.map((month) => {
    const existing = lookup.get(month)
    return {
      month,
      price: existing?.price ?? null,
      unit: existing?.unit ?? product?.default_unit ?? '',
      sampleCount: existing?.sampleCount ?? 0,
    }
  })
}

function buildAnalysisStats(points: AnalysisPoint[]): AnalysisStats {
  const pricedPoints = points.filter((point): point is AnalysisPoint & { price: number } => typeof point.price === 'number')
  if (points.length === 0) {
    return {
      averagePrice: null,
      highPrice: null,
      lowPrice: null,
      changeRate: null,
      startMonth: null,
      endMonth: null,
    }
  }

  const first = points[0]
  const last = points.at(-1) ?? first
  const firstPriced = pricedPoints[0] ?? null
  const lastPriced = pricedPoints.at(-1) ?? firstPriced

  return {
    averagePrice:
      pricedPoints.length > 0 ? pricedPoints.reduce((sum, point) => sum + point.price, 0) / pricedPoints.length : null,
    highPrice: pricedPoints.length > 0 ? Math.max(...pricedPoints.map((point) => point.price)) : null,
    lowPrice: pricedPoints.length > 0 ? Math.min(...pricedPoints.map((point) => point.price)) : null,
    changeRate:
      firstPriced == null || lastPriced == null || firstPriced.price === 0
        ? null
        : ((lastPriced.price - firstPriced.price) / firstPriced.price) * 100,
    startMonth: first?.month ?? null,
    endMonth: last?.month ?? null,
  }
}

function buildAnalysisMonthMarks(points: AnalysisPoint[]) {
  if (points.length === 0) return []
  return points.map((point) => point.month)
}

function buildMonthSequence(endMonth: string, months: number) {
  const end = parseMonth(endMonth)
  const sequence: string[] = []

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    sequence.push(toMonthString(addMonths(end, -offset)))
  }

  return sequence
}

function parseMonth(value: string) {
  const [year, month] = value.split('-').map((part) => Number(part))
  return new Date(year, (month ?? 1) - 1, 1)
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date)
  copy.setMonth(copy.getMonth() + months)
  return copy
}

function toMonthString(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function buildRiskCards(records: RiskRow[], products: ProductRow[]) {
  return records
    .map((record) => {
      const product = Array.isArray(record.products) ? record.products[0] : record.products
      const fallbackProduct = products.find((item) => item.id === record.product_id)

      return {
        id: record.id,
        productId: record.product_id,
        name: product?.display_name ?? fallbackProduct?.display_name ?? record.product_id,
        countyCode: record.county_code,
        periodStart: record.period_start,
        periodEnd: record.period_end,
        riskScore: record.risk_score,
        riskGrade: record.risk_grade,
        sourcePriceCount: record.source_price_count,
        evidence: record.evidence ?? {},
        dataQuality: record.data_quality ?? {},
      }
    })
    .sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1))
}

function buildReportSummary(
  dashboardCards: DashboardCard[],
  riskCards: RiskCard[],
  lastSyncedAt: string | null,
  lastRiskRunAt: string | null,
  selectedProductId: string,
) {
  const scopedCards = selectedProductId === 'all' ? dashboardCards : dashboardCards.filter((item) => item.productId === selectedProductId)
  const scopedRisks = selectedProductId === 'all' ? riskCards : riskCards.filter((item) => item.productId === selectedProductId)
  const selectedTargetName =
    selectedProductId === 'all' ? '전체 품목' : scopedCards[0]?.name ?? scopedRisks[0]?.name ?? '선택 품목'
  const validCards = scopedCards.filter((item) => item.hasPriceData)
  const topRisers = validCards
    .filter((item) => item.changeRate > 0)
    .sort((a, b) => b.changeRate - a.changeRate)
    .slice(0, 6)
  const topFallers = validCards
    .filter((item) => item.changeRate < 0)
    .sort((a, b) => a.changeRate - b.changeRate)
    .slice(0, 6)
  const priorityRisks = scopedRisks
    .filter((item) => item.riskScore != null)
    .sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1))
    .slice(0, 6)
  const latestPriceDate = validCards
    .map((item) => item.latestDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null
  const upCount = validCards.filter((item) => item.changeRate > 0).length
  const downCount = validCards.filter((item) => item.changeRate < 0).length
  const flatCount = validCards.filter((item) => Math.abs(item.changeRate) < 0.05).length
  const highRiskCount = scopedRisks.filter((item) => item.riskGrade === 'high').length
  const watchRiskCount = scopedRisks.filter((item) => item.riskGrade === 'watch').length
  const strongestRise = topRisers[0] ?? null
  const strongestFall = topFallers[0] ?? null
  const highestRisk = priorityRisks[0] ?? null

  const insights = [
    validCards.length > 0
      ? `최근 가격 데이터가 있는 품목은 ${validCards.length}개이며 상승 ${upCount}개, 하락 ${downCount}개, 보합 ${flatCount}개로 집계됩니다.`
      : '현재 보고서에 반영할 가격 데이터가 없습니다. 대시보드에서 시세 동기화를 먼저 실행해 주세요.',
    strongestRise
      ? `직전 가격 대비 상승 폭이 가장 큰 품목은 ${strongestRise.name}(${formatChange(strongestRise.changeRate)})입니다.`
      : '직전 가격 대비 상승 품목은 확인되지 않았습니다.',
    strongestFall
      ? `직전 가격 대비 하락 폭이 가장 큰 품목은 ${strongestFall.name}(${formatChange(strongestFall.changeRate)})입니다.`
      : '직전 가격 대비 하락 품목은 확인되지 않았습니다.',
    highestRisk
      ? `위험 점수가 가장 높은 품목은 ${highestRisk.name}이며, ${riskLabel(highestRisk.riskGrade)} 등급 ${highestRisk.riskScore?.toFixed(1) ?? '-'}점입니다.`
      : '최신 위험 계산 결과가 없어 위험 우선순위를 표시하지 못했습니다.',
  ]
  const periodStart =
    validCards
      .flatMap((item) => item.series.map((point) => point.date))
      .sort()[0] ?? null
  const periodEnd = latestPriceDate
  const highRiskPreview = priorityRisks.slice(0, 4).map((item) =>
    `${item.name}: ${riskLabel(item.riskGrade)} ${item.riskScore?.toFixed(1) ?? '-'}점, ${getCountyName(item.countyCode)} 기준`,
  )
  const marketWatchPreview = [
    strongestRise ? `${strongestRise.name}은 직전 가격 대비 ${formatChange(strongestRise.changeRate)} 상승했습니다.` : '',
    strongestFall ? `${strongestFall.name}은 직전 가격 대비 ${formatChange(strongestFall.changeRate)} 하락했습니다.` : '',
    validCards.length > 0 ? `가격 기준일은 ${latestPriceDate ?? '없음'}이며 전주, 순천, 광주 소매가격 평균을 사용합니다.` : '',
  ].filter(Boolean)
  const dataQualityPreview = [
    `가격 데이터 보유 품목은 ${validCards.length}개입니다.`,
    `위험 계산 결과는 ${scopedRisks.length}개이며 최신 계산 시각은 ${formatTime(lastRiskRunAt)}입니다.`,
    `최근 시세 동기화 시각은 ${formatTime(lastSyncedAt)}입니다.`,
  ]

  return {
    totalProducts: scopedCards.length,
    validProducts: validCards.length,
    upCount,
    downCount,
    highRiskCount,
    watchRiskCount,
    selectedTargetName,
    latestPriceDate,
    periodStart,
    periodEnd,
    lastSyncedAt,
    lastRiskRunAt,
    topRisers,
    topFallers,
    priorityRisks,
    insights,
    highRiskPreview,
    marketWatchPreview,
    dataQualityPreview,
  }
}

function getCountyName(code: string) {
  return TARGET_COUNTIES.find((county) => county.code === code)?.name ?? code
}

function buildReportDraft(summary: ReturnType<typeof buildReportSummary>): ReportDraft {
  const title = `전라도 농수산물 AI 보고서 - ${summary.selectedTargetName} (${summary.periodEnd ?? '기준일 없음'})`
  const highRiskSummary =
    summary.highRiskPreview.length > 0
      ? summary.highRiskPreview
      : ['최신 위험 계산 결과에서 고위험 품목이 확인되지 않았거나 위험 데이터가 부족합니다.']
  const marketWatch =
    summary.marketWatchPreview.length > 0
      ? summary.marketWatchPreview
      : ['가격 변동을 판단할 수 있는 최근 가격 데이터가 부족합니다.']
  const actionNotes = [
    `분석 대상은 ${summary.selectedTargetName}이며, 최근 가격 흐름과 위험 상태를 함께 확인했습니다.`,
    summary.highRiskCount > 0
      ? '고위험 품목은 가격 급등락 원인을 확인하고 산지·도매·소매 단계의 재고와 출하 상황을 함께 점검합니다.'
      : '고위험 품목이 없더라도 상승 상위 품목은 단기 수요 변화와 공급 지연 여부를 확인합니다.',
    summary.downCount > summary.upCount
      ? '하락 품목이 많은 구간에서는 생산자 판매 압박과 재고 누적 가능성을 함께 검토합니다.'
      : '상승 품목이 많은 구간에서는 소비자 가격 부담과 대체 품목 가격 흐름을 함께 확인합니다.',
    '보고서 수치는 KAMIS 소매가격 기반이므로 실제 계약 가격, 물류비, 산지 출하 자료와 함께 해석합니다.',
  ]
  const dataQuality = summary.dataQualityPreview
  const reportSummary = summary.insights[0] ?? '가격 범위 데이터를 기준으로 생성한 보고서입니다.'
  const content = [
    `# ${title}`,
    '',
    `분석 대상: ${summary.selectedTargetName}`,
    '',
    '## 고위험 품목 요약',
    ...highRiskSummary.map((item) => `- ${item}`),
    '',
    '## 시장 관찰',
    ...marketWatch.map((item) => `- ${item}`),
    '',
    '## 대응 참고 사항',
    ...actionNotes.map((item) => `- ${item}`),
    '',
    '## 데이터 품질',
    ...dataQuality.map((item) => `- ${item}`),
  ].join('\n')

  return {
    title,
    summary: reportSummary,
    content,
    highRiskSummary,
    marketWatch,
    actionNotes,
    dataQuality,
  }
}

function normalizeGeneratedReport(
  report: Partial<ReportDraft> | null | undefined,
  fallbackSummary: ReturnType<typeof buildReportSummary>,
): ReportDraft {
  if (!report) return buildReportDraft(fallbackSummary)

  return {
    title: report.title?.trim() || buildReportDraft(fallbackSummary).title,
    summary: report.summary?.trim() || fallbackSummary.insights[0] || '가격 범위 데이터를 기준으로 생성한 보고서입니다.',
    content: report.content?.trim() || buildReportDraft(fallbackSummary).content,
    highRiskSummary: normalizeBulletList(report.highRiskSummary, fallbackSummary.highRiskPreview),
    marketWatch: normalizeBulletList(report.marketWatch, fallbackSummary.marketWatchPreview),
    actionNotes: normalizeBulletList(report.actionNotes, []),
    dataQuality: normalizeBulletList(report.dataQuality, fallbackSummary.dataQualityPreview),
  }
}

function normalizeBulletList(values: unknown, fallback: string[]): string[] {
  if (!Array.isArray(values)) return [...fallback]
  const items = values.map((value) => String(value).trim()).filter(Boolean)
  return items.length > 0 ? items : [...fallback]
}

async function fetchSavedReports() {
  const query = new URLSearchParams({
    select: 'id,product_id,title,summary,content,period_start,period_end,created_at',
    visibility: 'eq.public',
    order: 'created_at.desc',
    limit: '10',
  })
  const data = await restFetch<SavedReportRow[]>(`/rest/v1/reports?${query.toString()}`)
  return data ?? []
}

async function fetchConversations() {
  const query = new URLSearchParams({
    select: 'id,title,last_message_at,created_at',
    order: 'last_message_at.desc.nullslast,created_at.desc',
    limit: '1',
  })
  const data = await restFetch<ConversationRow[]>(`/rest/v1/conversations?${query.toString()}`)
  return data ?? []
}

async function fetchMessages(conversationId: string) {
  const query = new URLSearchParams({
    select: 'id,conversation_id,role,content,status,model_name,created_at',
    conversation_id: `eq.${conversationId}`,
    order: 'created_at.asc',
  })
  const data = await restFetch<MessageRow[]>(`/rest/v1/messages?${query.toString()}`)
  return data ?? []
}

async function restFetch<T>(path: string) {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  const token = currentAuthToken ?? key
  const response = await fetch(`${url}${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) throw new Error(await readResponseError(response))
  return (await response.json()) as T
}

async function invokeFunction<T>(name: string, body: unknown) {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  const token = currentAuthToken ?? key
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new Error(await readResponseError(response))
  return (await response.json()) as T
}

function getSupabaseUrl() {
  const value = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!value) throw new Error('VITE_SUPABASE_URL is not configured.')
  return value.replace(/\/$/, '')
}

function getSupabaseAnonKey() {
  const value = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!value) throw new Error('VITE_SUPABASE_ANON_KEY is not configured.')
  return value
}

async function readResponseError(response: Response) {
  const text = await response.text()
  let message = text
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string }
    message = parsed.error ?? parsed.message ?? text
  } catch {
  }

  if (response.status === 401) return '로그인한 사용자만 이용할 수 있습니다.'
  if (response.status === 403) return '이 기능을 사용할 권한이 없습니다.'
  return message || `Request failed with ${response.status}`
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
}

export default App




