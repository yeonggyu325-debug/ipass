## [채점 STEP 1] 평가 데이터 구조 및 scoring.js 기반 구축

기존 scoring.js를 아래와 같이 전면 교체해줘.
기존 initScoringModule() 뼈대는 삭제하고 실제 로직으로 대체.

※ PC 전용. @media 쿼리 및 모바일 반응형 코드 작성 금지.

---

### 1. 평가 항목 데이터 (EVALUATION_ITEMS 상수)

아래 항목을 scoring.js 상단에 상수로 정의:

const EVALUATION_ITEMS = [
  {
    id: "bonus_1",
    category: "가점",
    subCategory: "안전보건경영시스템 구축 및 운영",
    maxScore: 3,
    isBonus: true,
    naAllowed: false
  },
  {
    id: "bonus_2",
    category: "가점",
    subCategory: "환경안전 부문 수상이력",
    maxScore: 2,
    isBonus: true,
    naAllowed: false
  },
  {
    id: "item_1",
    category: "중대산업재해 예방",
    subCategory: "경영책임자 안전보건 의무 이행",
    maxScore: 10,
    isBonus: false,
    naAllowed: true,
    naCondition: "상시근로자 5인 미만"
  },
  {
    id: "item_2",
    category: "안전보건 관리체계",
    subCategory: "안전·보건 업무 전담조직 설치",
    maxScore: 3,
    isBonus: false,
    naAllowed: true,
    naCondition: "상시근로자 5인 미만"
  },
  {
    id: "item_3",
    category: "안전보건 관리체계",
    subCategory: "안전·보건관리자 적정 수 배치",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "인원 미만 사업장 또는 비해당 업종"
  },
  {
    id: "item_4",
    category: "안전보건 관리체계",
    subCategory: "안전보건관리책임자·관리감독자 선임",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "상시근로자 5인 미만 또는 비해당 업종"
  },
  {
    id: "item_5",
    category: "안전보건 관리체계",
    subCategory: "안전보건방침 및 목표 수립",
    maxScore: 3,
    isBonus: false,
    naAllowed: true,
    naCondition: "상시근로자 5인 미만(중대재해처벌법 비대상)"
  },
  {
    id: "item_6",
    category: "안전보건 관리체계",
    subCategory: "안전보건관리규정",
    maxScore: 3,
    isBonus: false,
    naAllowed: true,
    naCondition: "업종·인원 미해당"
  },
  {
    id: "item_7",
    category: "안전보건 관리체계",
    subCategory: "법령 요지 게시",
    maxScore: 2,
    isBonus: false,
    naAllowed: true,
    naCondition: "업종·인원 미해당"
  },
  {
    id: "item_8",
    category: "안전보건 관리체계",
    subCategory: "산업안전보건위원회 및 안전보건회의",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "업종·인원 미해당"
  },
  {
    id: "item_9",
    category: "안전보건 관리체계",
    subCategory: "안전보건교육 실시 (정기)",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "안전보건교육 대상 아닌 근거 제시"
  },
  {
    id: "item_10",
    category: "안전보건 관리체계",
    subCategory: "안전보건교육 실시 (채용시·특별교육)",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "최근 반기 교육 없음에 대한 사유 작성"
  },
  {
    id: "item_11",
    category: "유해위험 방지조치",
    subCategory: "위험성평가 및 개선절차 마련",
    maxScore: 10,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_12",
    category: "유해위험 방지조치",
    subCategory: "작업중지 및 비상조치",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "5인 미만 중대재해처벌법 비대상 등"
  },
  {
    id: "item_13",
    category: "유해위험 방지조치",
    subCategory: "재해 발생시 재발방지 대책",
    maxScore: 4,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_14",
    category: "근로자 보건관리",
    subCategory: "보호구 관리",
    maxScore: 5,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_15",
    category: "근로자 보건관리",
    subCategory: "건강검진",
    maxScore: 5,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_16",
    category: "근로자 보건관리",
    subCategory: "작업환경측정",
    maxScore: 3,
    isBonus: false,
    naAllowed: true,
    naCondition: "측정대상 유해인자 없음(경영책임자 확인서 제출)"
  },
  {
    id: "item_17",
    category: "근로자 보건관리",
    subCategory: "근골격계 유해요인 조사",
    maxScore: 3,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_18",
    category: "근로자 보건관리",
    subCategory: "물질안전보건자료(MSDS)",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "사업장 내 화학물질 미사용(경영책임자 확인서 제출)"
  },
  {
    id: "item_19",
    category: "도급시 산업재해 예방",
    subCategory: "도급사업시의 안전보건조치",
    maxScore: 6,
    isBonus: false,
    naAllowed: true,
    naCondition: "도급관계의 협력사(수급인 없음)"
  },
  {
    id: "item_20",
    category: "도급시 산업재해 예방",
    subCategory: "도급업체 평가 및 비용 확인",
    maxScore: 6,
    isBonus: false,
    naAllowed: true,
    naCondition: "도급관계의 협력사(수급인 없음)"
  },
  {
    id: "item_21",
    category: "도급시 산업재해 예방",
    subCategory: "산안법 도급승인",
    maxScore: 2,
    isBonus: false,
    naAllowed: true,
    naCondition: "이루자와의 업무 중 산안법 도급승인 대상 작업 없음"
  }
];

---

### 2. localStorage 데이터 구조

localStorage key: 'scoringData'
{
  "companyId": "allowedCompanies의 id",
  "companyName": "회사명",
  "periodYear": "2025",
  "periodHalf": "상반기" | "하반기",
  "scoredBy": "채점한 관리자 아이디",
  "scoredAt": "채점일시",
  "isPublished": false,
  "items": {
    "item_1": {
      "score": 8,           // 취득 점수 (숫자) 또는 null
      "isNA": false,        // N/A 여부
      "naReason": "",       // N/A 사유
      "comment": ""         // 채점 메모
    },
    "bonus_1": {
      "score": 3,
      "isNA": false,
      "naReason": "",
      "comment": ""
    }
    // ... 모든 항목
  }
}

localStorage key: 'allScoringData'
// 모든 회사/반기별 채점 결과 배열
[scoringData, scoringData, ...]

---

### 3. 점수 계산 함수

/**
 * @description 채점 결과 계산
 * @param {object} scoringData - 채점 데이터
 * @returns {object} 계산 결과
 */
function calculateScore(scoringData) {
  // 기본 항목만 계산 (isBonus: false)
  // N/A 항목 제외하고 실배점 합산
  // 환산점수 = (실취득점수 / 실배점) * 100 (소수점 2자리)
  // 가점 별도 합산 (최대 5점)
  // 최종점수 = 환산점수 + 가점 (최대 100점 + 5점)
  return {
    실취득점수: 0,
    실배점: 0,
    환산점수: 0,      // 소수점 2자리
    가점: 0,
    최종점수: 0,      // 소수점 2자리
    등급: "",
    naItems: []       // N/A 처리된 항목 id 배열
  };
}

/**
 * @description 등급 판정
 * @param {number} 최종점수
 * @returns {string} 등급명
 */
function getGrade(finalScore) {
  // 90점 이상 → "안전보건 우수 협력사"
  // 70점 이상 → "적격 협력사"
  // 70점 미만 → "역량강화 대상 협력사"
}

---

### 4. initScoringModule() 업데이트

기존 뼈대를 실제 초기화 함수로 교체:
- EVALUATION_ITEMS 로드 확인
- localStorage scoringData 초기화 확인
- calculateScore, getGrade 함수 등록

---

### 완료 후 GitHub push

git add .
git commit -m "feat: 채점 데이터 구조 및 점수 계산 로직 구축 (STEP 1)"
git push origin main
