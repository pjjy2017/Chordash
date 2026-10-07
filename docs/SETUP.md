# SETUP — 새 PC 개발 환경 준비

대상: Windows 10/11. 보안 장비 우회는 필요 없는 일반 네트워크 기준.

## 1. 설치할 프로그램
1. **Node.js (LTS 버전)** — https://nodejs.org 에서 LTS 설치 파일을 받아 기본 옵션으로 설치
2. **Git for Windows** — https://git-scm.com 에서 설치, 기본 옵션 유지
3. **Claude Code** — Anthropic 공식 문서(https://docs.claude.com 의 Claude Code 항목)의 Windows 설치 안내를 따름
4. (선택) **VS Code** — 코드 확인용 편집기

## 2. 설치 확인
PowerShell을 새로 열고:
```powershell
node -v      # 버전 번호가 나오면 성공
npm -v
git --version
claude --version
```

## 3. 프로젝트 폴더 만들기
```powershell
mkdir C:\src\chordash
cd C:\src\chordash
```
이 문서 세트(`CLAUDE.md`, `docs/`, `examples/`)를 이 폴더에 그대로 복사합니다.

## 4. Claude Code 시작
```powershell
cd C:\src\chordash
claude
```
첫 메시지 예:
> CLAUDE.md와 docs를 읽고 ROADMAP의 Phase 0을 진행해줘.

## 5. 패키지 설치와 실행 (Phase 0 이후)
```powershell
cd C:\src\chordash
npm install        # package.json에 적힌 라이브러리를 node_modules에 설치 (처음 한 번, 몇 분 걸림)
npm run dev        # 앱을 개발 모드로 실행 (창을 닫으면 종료, 또는 터미널에서 Ctrl+C)
npm test           # 자동 테스트 실행
```
- 앱 창에서 `F12`를 누르면 개발자 도구가 열립니다.
- `npm install` 중 "install-scripts" 경고가 나오면 허용 목록(`package.json`의 `allowScripts`)에 없는 패키지가 생긴 것입니다. Claude Code에 확인을 요청하세요.

## 6. 이미지·PDF 임포트용 (Phase 8부터)
- Anthropic API 키가 필요합니다(https://console.anthropic.com). API 사용 요금은 Claude 구독과 별도로 청구됩니다.
- 키는 앱의 설정 화면에서만 입력하고, 저장소 파일이나 채팅에 붙여넣지 않습니다.

## 7. 설치 파일 만들기 (v1.0.0부터)
```powershell
cd C:\src\chordash
npm run build:win   # 검사·빌드 후 dist\chordash-버전-setup.exe 설치 파일을 만듦 (몇 분 걸림)
```
- 디지털 서명이 없는 설치 파일이라 처음 실행할 때 Windows가 "알 수 없는 앱" 경고를 띄웁니다. **추가 정보 → 실행**을 누르세요.
- 버전 번호는 `package.json`의 `version`입니다. 고친 판을 낼 때 올립니다(1.0.0 → 1.0.1).

## 8. 웹 버전 (Phase 11부터)
```powershell
cd C:\src\chordash
npm run dev:web       # 웹 버전을 개발 모드로 실행 (터미널에 나온 주소를 브라우저로 열기)
npm run build:web     # GitHub Pages에 올릴 파일을 dist-web 폴더에 만듦
npm run preview:web   # 만든 dist-web을 브라우저로 미리 보기
```
- GitHub에 올리면(`main` 브랜치) GitHub Actions가 자동으로 테스트·빌드·배포합니다. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 한 번 맞춰 두어야 합니다.
