# Chordash

코드 악보를 텍스트로 빠르게 입력하고 A4 악보(PDF)로 뽑는 앱입니다.

```
title: 샴푸의 요정
key: F

[Verse]
Bb^7, A-7, Bb^7, F B7*
l: 가사 큐
```

- **웹 버전:** https://pjjy2017.github.io/Chordash/ — 브라우저에서 바로 씁니다. 설치 필요 없음.
- **데스크톱 버전(Windows):** 웹 버전 기능 + 손글씨·인쇄 악보 사진/PDF를 AI로 읽어 오기, 셋리스트가 곡 파일을 직접 다시 읽기. 설치 파일은 `npm run build:win`으로 만듭니다(`docs/SETUP.md`).

## 기능

- 단축 입력(`-` 마이너, `^` 메이저7, `%` 하프디미니시, 도수 `2-7`), 실시간 A4 미리보기
- 조옮김(미리보기만 또는 원본에 적용), 코드 이름 ↔ 도수 바꾸기
- 반복기호·엔딩·파트(송폼)·N.C.·악센트·브레스·색 메모
- 텍스트 악보 가져오기(가사 위 코드, 마디선 텍스트, ChordPro, CP949 파일)
- 셋리스트: 여러 곡을 목차 + 쪽 번호가 있는 한 PDF로

문법은 [`docs/SYNTAX.md`](docs/SYNTAX.md), 기능 범위는 [`docs/PRD.md`](docs/PRD.md)를 보세요.

## 개발

```powershell
npm install
npm run dev        # 데스크톱 앱
npm run dev:web    # 웹 버전
npm test
```
