# DECISIONS — 결정 기록

형식: 날짜 · 결정 · 이유. 새 결정은 아래에 추가합니다.

## 2026-10-03 (기획 단계, 채팅에서 결정)
- **입력 방식:** 텍스트 입력 + 실시간 미리보기. 클릭 편집은 나중에. — 개발량이 적고 입력이 가장 빠름.
- **스택:** Electron + TypeScript. — 미리보기 HTML을 그대로 `printToPDF` 하면 화면과 PDF가 일치. Flutter/WPF는 화면용·PDF용 레이아웃을 따로 짜야 함. 설치 용량(약 100MB)은 개인용이라 감수.
- **개발 방식:** Claude Code. 기획·문법 결정은 채팅, 구현은 Claude Code.
- **테마:** 테마 전환 지원. 기본값은 손글씨풍·리얼북풍이 아닌 가독성 좋은 굵은 고딕. 확장음 표기(위첨자/한 줄)는 테마마다.
- **레이아웃:** 줄마다 마디 수 자유, 한 줄 안 마디 폭 균등.
- **페이지 넘김:** 자동 + 수동(`---`).
- **파일:** 곡당 텍스트 파일 하나. 앱 내 라이브러리 없음.
- **v1 필수:** 조옮김(전체/섹션), 주석(별표·브레스·색 메모), 반복기호·엔딩.
- **셋리스트 PDF:** 나중에.
- **도수 기본 성질:** 숫자만 쓰면 항상 메이저 (`2` = 메이저, `2-` = 마이너).
- **변환 방식:** 원본 텍스트 그대로 저장, 변환은 미리보기·힌트로만. — 도수 입력 시 키 한 줄로 조옮김 가능.
- **`b` 충돌:** 토큰 맨 앞 소문자 `b` + 숫자 = 플랫 도수. B 코드는 대문자.
- **임포트 추가:** 텍스트 임포트(규칙 기반, 오프라인)와 이미지·PDF 임포트를 v1.x로.
- **이미지 인식 방식:** Claude API 비전. — 전통 OCR(Tesseract 등)은 손글씨와 코드 기호(♭, △, 위첨자, 슬래시)에 약하고, 결과를 우리 문법으로 구조화하는 일도 별도로 필요. 비전 모델은 문법 명세를 받아 바로 chordpad 텍스트로 출력 가능. 대가: 인터넷 필요, API 키와 사용 요금.
- **임포트 결과:** 자동 저장 없음. 새 탭에서 검토 후 사용자가 저장. 불확실한 부분은 `?` 표시.

## 2026-10-03 (Phase 0)
- **문서 배치:** 루트에 풀려 있던 문서를 `docs/`, 예제를 `examples/`로 옮김(`chordpad.zip` 원본과 내용 동일 확인). 원본 zip은 `.gitignore`로 제외. — CLAUDE.md의 문서 지도와 경로를 맞춤.
- **프로젝트 생성 도구:** electron-vite (`npm create @quick-start/electron`, `vanilla-ts` 템플릿, Electron 39 · Vite 7 · TypeScript 5.9). — main/preload/renderer를 Vite 설정 하나로 빌드하고 HMR 지원. Electron Forge의 Vite 플러그인은 v7.5부터 "experimental" 표시라 제외. UI 프레임워크(React 등)는 쓰지 않음: 화면이 에디터(CodeMirror 6)와 미리보기 HTML뿐이라 불필요.
- **패키징:** electron-builder(템플릿 기본값), Windows(NSIS) 설정만 남김. mac/linux 설정·스크립트 제거.
- **테스트:** Vitest 5, 별도 `vitest.config.ts`(node 환경). 테스트 파일은 대상 옆에 `*.test.ts`로 둠(`src/core/foo.ts` ↔ `src/core/foo.test.ts`).
- **`src/core` 공유:** main과 renderer 양쪽 tsconfig에 `src/core`를 포함해 어느 쪽에서든 import 가능. core는 DOM·Node API를 쓰지 않음.
- **npm install 스크립트 허용:** npm 11은 패키지 설치 스크립트를 기본 차단함. `electron`(실행 파일 다운로드), `esbuild`, `electron-winstaller`만 `package.json`의 `allowScripts`에 허용.
- **줄바꿈:** `.gitattributes`로 저장소 내 텍스트 파일을 LF로 통일. — 템플릿 파일이 LF이고, Windows Git의 CRLF 변환 경고를 없앰.
