# WORKLOG

프로젝트 진행 내역과 주요 의사결정을 남기는 작업 기록입니다.  
최종 갱신일: 2026-07-23

## 진행 요약

| 단계 | 상태 | 핵심 내용 | 관련 파일 |
|---|---|---|---|
| 1. 문서 및 기획 | 완료 | 요구사항 정리, 사용자 흐름, PRD, 추적표 작성 | `document/`, `docs/` |
| 2. 개발 환경 준비 | 완료 | Supabase 연결, KAMIS/Gemini/Pinecone 환경변수 정리, CLI 준비 | `.env.local`, `frontend/.env.local`, `supabase/` |
| 3. 아키텍처 및 데이터 설계 | 완료 | 전체 시스템 구조, 데이터 흐름, DB 스키마, RLS 정리 | `docs/03-design/` |
| 4. 데이터 수집 및 분석 백엔드 | 완료 | KAMIS 수집, 위험 점수 계산, 보고서 생성, 벡터 동기화 | `supabase/functions/` |
| 5. Pinecone 및 RAG 구현 | 완료 | 검색용 문서 생성, 임베딩, 질의응답 라우팅, RAG 응답 구성 | `supabase/functions/ask-ai`, `generate-rag-answer`, `sync-vectors` |
| 6. React 공통 구조 및 페이지 구현 | 완료 | 대시보드, 가격추이, 위험분석, 보고서, 채팅 화면 구현 | `frontend/src/` |
| 7. 테스트 및 검증 | 완료 | 주요 시나리오 테스트, 화면/기능 점검, 요구사항 검증표 갱신 | `docs/04-validation/test-report.md` |
| 8. 최종 통합 및 문서화 | 진행/완료 | README 및 WORKLOG 작성, 최종 시나리오 검토 | `README.md`, `WORKLOG.md` |
| 배포 | 완료 | Sites 프로덕션 배포 완료 | `https://jeolla-agri-analysis.ai-ax-9678.chatgpt.site` |

## 주요 작업 기록

### 2026-07-23

- Supabase Auth 기반 로그인 / 로그아웃을 프론트엔드에 연결
- 채팅 기록이 세션 단위로 남도록 conversation / message 조회 흐름 추가
- 사이드바 로그인 정보 UI 축소 및 로그아웃 아이콘화
- `readResponseError`의 불필요한 재할당 제거
- `calculate-risks/index.ts`에 누락된 `shiftMonths` 함수 추가
- Sites 프로덕션 배포 수행 및 최종 배포 URL 확인
- `README.md`, `WORKLOG.md` 작성

### 2026-07-22

- 초기 데이터 모델 및 RLS 정책 구성
- KAMIS 수집, 위험 분석, 문서 생성, 벡터 동기화, AI 응답 Edge Functions 구현
- 대시보드와 가격추이, 위험분석, 보고서, 채팅 UI 초안 구성

## 주요 설계 결정

- 가격 데이터는 Supabase를 기준 저장소로 사용
- 외부 API 호출은 Edge Functions로만 수행
- 실서비스 데이터와 mock 데이터를 UI에서 구분 가능하도록 유지
- 채팅 기록은 사용자 세션 기준으로 분리 저장
- 보고서는 AI 생성 결과와 저장 기능을 분리해 운영

## 남은 점검 항목

- KAMIS의 일부 품목 조합별 결측 여부 점검
- 배포 환경 Secrets와 로컬 `.env.local` 동기화 상태 점검
- 외부 API 장애 시 fallback 동작 재확인
- 필요 시 README와 WORKLOG의 최신 상태 유지

