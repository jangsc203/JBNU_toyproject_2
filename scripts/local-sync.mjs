import fs from 'node:fs';
import path from 'node:path';

// 1. .env.local 파일 파싱하여 환경 변수 획득
const envPath = path.join(process.cwd(), '.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
}

const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const KAMIS_KEY = env.KAMIS_API_KEY;
const KAMIS_ID = env.KAMIS_API_ID;

if (!SUPABASE_URL || !SERVICE_KEY || !KAMIS_KEY || !KAMIS_ID) {
  console.error("❌ 에러: .env.local 파일에 필수 환경변수가 누락되었습니다.");
  process.exit(1);
}

const supabaseHeaders = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// 날짜 도우미 함수
const toDateString = (d) => d.toISOString().split('T')[0];
const shiftDate = (dateString, days) => {
  const d = new Date(`${dateString}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
};
const shiftMonths = (dateString, months) => {
  const d = new Date(`${dateString}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toDateString(d);
};

const today = toDateString(new Date());
const startDate = shiftDate(today, -29); // 최근 30일
const DEFAULT_COUNTY_CODES = ["3511", "3613", "2401"];

// KAMIS 호출 공통 함수
async function fetchKamis(action, params) {
  const url = new URL("https://www.kamis.or.kr/service/price/xml.do");
  url.searchParams.set("action", action);
  url.searchParams.set("p_cert_key", KAMIS_KEY);
  url.searchParams.set("p_cert_id", KAMIS_ID);
  url.searchParams.set("p_returntype", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

// 날짜 포맷팅 정밀 정규화
function normalizeKamisDate(rawRegday, rawYyyy) {
  const cleanRegday = String(rawRegday || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanRegday)) return cleanRegday;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(cleanRegday)) return cleanRegday.replaceAll('.', '-');
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(cleanRegday)) return cleanRegday.replaceAll('/', '-');
  if (/^\d{2}-\d{2}$/.test(cleanRegday)) return `${rawYyyy}-${cleanRegday}`;
  if (/^\d{2}\.\d{2}$/.test(cleanRegday)) return `${rawYyyy}-${cleanRegday.replaceAll('.', '-')}`;
  if (/^\d{2}\/\d{2}$/.test(cleanRegday)) return `${rawYyyy}-${cleanRegday.replaceAll('/', '-')}`;
  return null;
}

function parsePrice(value) {
  const text = String(value || '').replaceAll(",", "").trim();
  if (!text || text === "-" || text.includes("품절") || text.includes("조사 안함")) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

// 중복 키 데이터 합치기 유틸리티 함수
function averageNullable(a, b) {
  if (a === null || a === undefined) return b;
  if (b === null || b === undefined) return a;
  return Math.round(((a + b) / 2) * 100) / 100;
}

function dedupePriceRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = [
      record.product_id,
      record.price_date,
      record.county_code,
      record.product_cls_code,
      record.market_name ?? "",
      record.source
    ].join("|");

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }

    byKey.set(key, {
      ...existing,
      price: averageNullable(existing.price, record.price),
      data_status: existing.data_status === 'valid' || record.data_status === 'valid' ? 'valid' : existing.data_status
    });
  }
  return Array.from(byKey.values());
}

async function main() {
  console.log("🚀 로컬 가격 수집 및 원격 백엔드 동기화 스크립트를 시작합니다.");
  
  // 1) 원격 Supabase에서 상품 목록(products) 로드
  console.log("📡 1. 원격 Supabase에서 활성화된 상품 목록 로딩 중...");
  const resProducts = await fetch(`${SUPABASE_URL}/rest/v1/products?is_active=eq.true&select=*`, {
    headers: supabaseHeaders
  });
  if (!resProducts.ok) {
    throw new Error(`상품 목록 로드 실패: ${resProducts.statusText}`);
  }
  const products = await resProducts.json();
  console.log(`✅ 상품 목록 로드 완료: 총 ${products.length}개 품목`);

  // 동기화 잡 기록 생성
  const resJob = await fetch(`${SUPABASE_URL}/rest/v1/data_sync_jobs?select=id`, {
    method: 'POST',
    headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      job_type: "kamis_period",
      status: "running",
      triggered_by: "manual",
      period_start: startDate,
      period_end: today,
      started_at: new Date().toISOString(),
    })
  });
  if (!resJob.ok) throw new Error("Sync job 생성 실패");
  const [{ id: jobId }] = await resJob.json();
  console.log(`📌 동기화 작업 ID 생성 완료: ${jobId}`);

  const records = [];

  // ==========================================
  // [PART 1] 최근 30일 일별 시세 수집 (Daily)
  // ==========================================
  console.log("\n📡 2-1. 최근 30일 일별 도소매 시세 수집 중...");
  
  for (const product of products) {
    let productSuccess = false;
    
    // 수입과일 등 소매(01)가 없는 품목의 구제를 위해 도매(02)까지 시도하는 다중 폴백 후보군
    const dailyCandidates = [
      { cls: "01", rank: product.kamis_rank_code || "04", kind: product.kamis_kind_code || "00", desc: "1차 소매(기본)" },
      { cls: "01", rank: "", kind: product.kamis_kind_code || "00", desc: "2차 소매(등급완화)" },
      { cls: "01", rank: "", kind: "", desc: "3차 소매(등급+품종완화)" },
      { cls: "02", rank: "", kind: "", desc: "4차 도매(최종우회)" }
    ];

    for (const countyCode of DEFAULT_COUNTY_CODES) {
      let dailyRecords = [];
      
      for (const candidate of dailyCandidates) {
        try {
          const data = await fetchKamis("periodRetailProductList", {
            p_productclscode: candidate.cls,
            p_startday: startDate,
            p_endday: today,
            p_itemcategorycode: product.kamis_category_code || "",
            p_itemcode: product.kamis_item_code,
            p_kindcode: candidate.kind,
            p_productrankcode: candidate.rank,
            p_countrycode: countyCode,
            p_convert_kg_yn: "N",
          });

          const priceData = data.price || data.data;
          if (!priceData) {
            // 데이터 수집이 완전히 실패한 경우, API가 반환한 오류 원인을 자세히 출력
            const reason = data.condition?.[0]?.message || data.condition?.message || "자료 없음";
            // console.warn(`      [경고] ${product.display_name}(${countyCode}) ${candidate.desc} 실패: ${reason}`);
            continue;
          }

          const rows = Array.isArray(priceData) ? priceData : (priceData.item || []);
          // 평균 데이터 필터링
          const avgRows = rows.filter(row => {
            const cName = String(row.countyname || row.county_name || '').trim();
            const mName = String(row.marketname || row.market_name || '').trim();
            return cName === '평균' || mName === '평균' || (!cName && !mName);
          });

          for (const row of avgRows) {
            const priceDate = normalizeKamisDate(row.regday, row.yyyy || today.slice(0, 4));
            if (!priceDate) continue;

            const price = parsePrice(row.price ?? row.dpr1 ?? row.dpr2);
            if (price === null) continue;

            dailyRecords.push({
              product_id: product.id,
              price_date: priceDate,
              price,
              unit: row.unit || product.default_unit,
              county_code: countyCode,
              county_name: countyCode === '3511' ? '전주' : countyCode === '3613' ? '순천' : '광주',
              market_name: 'recent_30d',
              product_cls_code: candidate.cls,
              product_cls_name: candidate.cls === '01' ? '소매' : '도매',
              source: 'KAMIS',
              source_action: 'periodRetailProductList',
              source_payload: { row },
              data_status: 'valid',
              is_mock: false,
              sync_job_id: jobId
            });
          }

          if (dailyRecords.length > 0) {
            records.push(...dailyRecords);
            productSuccess = true;
            break; // 수집 성공 시 폴백 후보군 루프 탈출
          }
        } catch (err) {
          // console.warn(`      [에러] ${product.display_name}(${countyCode}) ${candidate.desc} 호출 실패:`, err.message);
        }
      }
    }

    if (!productSuccess) {
      console.warn(`❌ [경고] ${product.display_name} 품목은 모든 폴백 시도에도 일별 데이터가 '0건' 수집되었습니다. (KAMIS에서 미제공)`);
    } else {
      console.log(`✅ [일별] ${product.display_name} 수집 성공`);
    }
  }

  // ==========================================
  // [PART 2] 가격추이 그래프용 월별 시세 수집 (Monthly)
  // ==========================================
  console.log("\n📡 2-2. 가격 추이 그래프용 월별 시세 수집 중 (최근 36개월)...");
  
  const startMonth = shiftMonths(today, -35).slice(0, 7); // YYYY-MM (과거 36개월로 수집 범위 확장)
  const yyyyStart = Number(startMonth.slice(0, 4));
  const yyyyEnd = Number(today.slice(0, 4));
  const periodYears = Math.max(yyyyEnd - yyyyStart + 1, 1);

  for (const product of products) {
    let productSuccess = false;
    
    // 소매(01) 실패 시 도매(02) 수집까지 고려한 폴백 후보군
    const monthlyCandidates = [
      { cls: "01", rank: product.kamis_rank_code || "04", kind: product.kamis_kind_code || "00", desc: "1차 소매(기본)" },
      { cls: "01", rank: "2", kind: product.kamis_kind_code || "00", desc: "2차 소매(2등급)" },
      { cls: "01", rank: "1", kind: product.kamis_kind_code || "00", desc: "3차 소매(1등급)" },
      { cls: "01", rank: "", kind: product.kamis_kind_code || "00", desc: "4차 소매(등급완화)" },
      { cls: "01", rank: "", kind: "", desc: "5차 소매(등급+품종완화)" },
      { cls: "02", rank: "", kind: "", desc: "6차 도매(최종우회)" }
    ];

    for (const countyCode of DEFAULT_COUNTY_CODES) {
      let monthlyRecords = [];
      
      for (const candidate of monthlyCandidates) {
        try {
          const data = await fetchKamis("monthlySalesList", {
            p_yyyy: String(yyyyEnd),
            p_period: String(periodYears),
            p_itemcategorycode: product.kamis_category_code || "",
            p_itemcode: product.kamis_item_code,
            p_kindcode: candidate.kind,
            p_graderank: candidate.rank,
            p_countycode: countyCode,
            p_convert_kg_yn: "N",
          });

          const priceData = data.price || data.data;
          if (!priceData) continue;

          const rows = Array.isArray(priceData) ? priceData : (priceData.item || []);
          const productRows = rows.filter(row => {
            const rCode = String(row.productclscode || row.product_cls_code || '');
            return !rCode || rCode === candidate.cls;
          });

          for (const row of productRows) {
            // KAMIS monthly API의 실제 연도별 가격 정보는 row.item 배열 내부에 위치함
            const items = Array.isArray(row.item) ? row.item : (row.item ? [row.item] : []);
            
            for (const item of items) {
              const year = String(item.yyyy || '').trim();
              if (!/^\d{4}$/.test(year)) continue;

              for (let m = 1; m <= 12; m++) {
                const price = parsePrice(item[`m${m}`]);
                if (price === null) continue;

                const priceDate = `${year}-${String(m).padStart(2, '0')}-01`;
                if (priceDate < `${startMonth}-01` || priceDate > today) continue;

                monthlyRecords.push({
                  product_id: product.id,
                  price_date: priceDate,
                  price,
                  unit: product.default_unit,
                  county_code: countyCode,
                  county_name: countyCode === '3511' ? '전주' : countyCode === '3613' ? '순천' : '광주',
                  market_name: 'monthly',
                  product_cls_code: candidate.cls,
                  product_cls_name: candidate.cls === '01' ? '소매' : '도매',
                  source: 'KAMIS',
                  source_action: 'monthlySalesList',
                  source_payload: { row: item },
                  data_status: 'valid',
                  is_mock: false,
                  sync_job_id: jobId
                });
              }
            }
          }

          if (monthlyRecords.length > 0) {
            records.push(...monthlyRecords);
            productSuccess = true;
            break; // 수집 성공 시 폴백 후보군 루프 탈출
          }
        } catch (err) {
          // 실패 시 다음 폴백 후보군으로 진행
        }
      }
    }

    if (!productSuccess) {
      console.warn(`❌ [경고] ${product.display_name} 품목은 모든 폴백 시도에도 월별 가격 데이터가 '0건' 수집되었습니다.`);
    } else {
      console.log(`✅ [월별] ${product.display_name} 수집 성공`);
    }
  }

  // 중복 데이터 제거 및 평균화 처리
  console.log(`\n📡 2-3. 수집된 원시 데이터 중복 제거 및 가공 중...`);
  const dedupedRecords = dedupePriceRecords(records);
  console.log(`✅ 수집 완료: 총 ${dedupedRecords.length}개의 가공된 가격 데이터 확보 (일별 + 월별)`);

  if (dedupedRecords.length > 0) {
    // 3) 원격 Supabase DB에 가격 데이터 Upsert
    console.log("\n📡 3. 원격 Supabase price_records 테이블에 데이터 적재 중...");
    
    const resUpsert = await fetch(`${SUPABASE_URL}/rest/v1/price_records?on_conflict=product_id,price_date,county_code,product_cls_code,market_name,source`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(dedupedRecords)
    });
    if (!resUpsert.ok) {
      const errText = await resUpsert.text();
      throw new Error(`DB 적재 실패: ${resUpsert.statusText} - 상세정보: ${errText}`);
    }
    console.log("✅ 원격 DB 데이터 적재 성공!");
  }

  // 동기화 잡 완료 기록 업데이트
  await fetch(`${SUPABASE_URL}/rest/v1/data_sync_jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    headers: supabaseHeaders,
    body: JSON.stringify({
      status: "success",
      finished_at: new Date().toISOString(),
      total_count: dedupedRecords.length,
      success_count: dedupedRecords.length,
    })
  });

  // 4) 후속 분석 Edge Functions 트리거 (위험 계산 -> 임베딩 -> 벡터 싱크)
  console.log("\n📡 4. 원격 분석 엔진(Edge Functions) 후속 트리거 실행 중...");
  
  const functionHeaders = {
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  console.log("   - [1/3] 위험 지수 계산 함수 호출 중...");
  await fetch(`${SUPABASE_URL}/functions/v1/calculate-risks`, { method: 'POST', headers: functionHeaders });

  console.log("   - [2/3] RAG용 보고서 문서 생성 함수 호출 중...");
  await fetch(`${SUPABASE_URL}/functions/v1/generate-analysis-documents`, { method: 'POST', headers: functionHeaders });

  console.log("   - [3/3] Pinecone 벡터 DB 동기화 함수 호출 중...");
  await fetch(`${SUPABASE_URL}/functions/v1/sync-vectors`, { method: 'POST', headers: functionHeaders });

  console.log("\n🎉 모든 가격 수집 및 백엔드 AI 엔진 연동이 완벽히 끝났습니다!");
}

main().catch(err => {
  console.error("❌ 작업 중 오류 발생:", err);
});
